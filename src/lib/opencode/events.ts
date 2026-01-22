import type {
	Event,
	Message,
	Part,
	Session,
	SessionStatus,
} from "@opencode-ai/sdk/v2";

import { getClient } from "./client";
import type { OpenCodeSessionMessage, OpenCodeSessionState } from "./state";
import { useOpenCodeSessionsStore } from "./state";
import type { OpenCodeSessionStatus } from "./types";

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

type SubscribeOptions = {
	directory?: string;
	signal?: AbortSignal;
};

export type OpenCodeEvent = Event;

export function subscribeToEvents(
	onEvent?: (event: OpenCodeEvent) => void,
	options: SubscribeOptions = {},
): () => void {
	let isActive = true;
	const controller = new AbortController();

	if (options.signal) {
		options.signal.addEventListener("abort", () => {
			isActive = false;
			controller.abort();
		});
	}

	const run = async () => {
		let delay = INITIAL_RETRY_DELAY_MS;

		while (isActive) {
			try {
				const streamResult = await getClient().event.subscribe(
					options.directory ? { directory: options.directory } : undefined,
					{ signal: controller.signal },
				);

				for await (const event of streamResult.stream) {
					if (!isActive) {
						break;
					}
					handleEvent(event);
					onEvent?.(event);
				}

				delay = INITIAL_RETRY_DELAY_MS;
			} catch (error) {
				if (!isActive) {
					break;
				}

				await sleep(delay);
				delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
			}
		}
	};

	void run();

	return () => {
		isActive = false;
		controller.abort();
	};
}

function handleEvent(event: OpenCodeEvent): void {
	switch (event.type) {
		case "session.created":
			upsertSession(event.properties.info);
			break;
		case "session.updated":
			upsertSession(event.properties.info);
			break;
		case "session.deleted":
			removeSession(event.properties.info.id);
			break;
		case "session.status":
			setSessionStatus(
				event.properties.sessionID,
				mapSessionStatus(event.properties.status),
			);
			break;
		case "session.idle":
			setSessionStatus(event.properties.sessionID, "completed");
			break;
		case "session.error":
			if (event.properties.sessionID) {
				setSessionStatus(event.properties.sessionID, "failed");
			}
			break;
		case "message.updated":
			upsertMessage(event.properties.info);
			break;
		case "message.part.updated":
			appendMessagePart(event.properties.part, event.properties.delta);
			break;
		case "message.removed":
			removeMessage(event.properties.sessionID, event.properties.messageID);
			break;
		default:
			break;
	}
}

function upsertSession(info: Session): void {
	const session = mapSession(info);
	useOpenCodeSessionsStore.setState((state) => {
		const sessions = new Map(state.sessions);
		const existing = sessions.get(session.id);
		const nextSession = existing
			? {
					...session,
					status: existing.status,
					messages: existing.messages,
				}
			: session;
		sessions.set(session.id, nextSession);

		return {
			sessions,
			currentSessionId: state.currentSessionId ?? session.id,
		};
	});
}

function setSessionStatus(
	sessionId: string,
	status: OpenCodeSessionStatus,
): void {
	updateSession(sessionId, (session) => ({
		...session,
		status,
	}));
}

function removeSession(sessionId: string): void {
	useOpenCodeSessionsStore.setState((state) => {
		if (!state.sessions.has(sessionId)) {
			return state;
		}

		const sessions = new Map(state.sessions);
		sessions.delete(sessionId);
		return {
			sessions,
			currentSessionId:
				state.currentSessionId === sessionId ? null : state.currentSessionId,
		};
	});
}

function upsertMessage(message: Message): void {
	const sessionId = message.sessionID;
	const mapped = mapMessage(message);

	updateSession(sessionId, (session) => {
		const messages = upsertSessionMessage(
			session.messages,
			mapped,
			(existing) => ({
				...existing,
				role: mapped.role,
				createdAt: mapped.createdAt,
			}),
		);
		return { ...session, messages };
	});
}

function appendMessagePart(part: Part, delta?: string): void {
	const sessionId = part.sessionID;
	const messageId = part.messageID;
	const text = extractTextFromPart(part, delta);

	if (!text) {
		return;
	}

	updateSession(sessionId, (session) => {
		const messages = upsertSessionMessage(
			session.messages,
			{
				id: messageId,
				role: "assistant",
				content: text,
				createdAt: new Date().toISOString(),
			},
			(existing) => ({
				...existing,
				content: mergeMessageContent(existing.content, text, delta),
			}),
		);
		return { ...session, messages };
	});
}

function removeMessage(sessionId: string, messageId: string): void {
	updateSession(sessionId, (session) => ({
		...session,
		messages: session.messages.filter((message) => message.id !== messageId),
	}));
}

function updateSession(
	sessionId: string,
	updater: (session: OpenCodeSessionState) => OpenCodeSessionState,
): void {
	useOpenCodeSessionsStore.setState((state) => {
		const existing =
			state.sessions.get(sessionId) ?? createFallbackSession(sessionId);
		const updated = updater(existing);
		const sessions = new Map(state.sessions);
		sessions.set(sessionId, updated);
		return {
			sessions,
			currentSessionId: state.currentSessionId ?? sessionId,
		};
	});
}

function mapSession(info: Session): OpenCodeSessionState {
	return {
		id: info.id,
		status: "unknown",
		startedAt: new Date(info.time.created).toISOString(),
		messages: [],
	};
}

function mapMessage(message: Message): OpenCodeSessionMessage {
	return {
		id: message.id,
		role: message.role,
		content: "",
		createdAt: new Date(message.time.created).toISOString(),
	};
}

function upsertSessionMessage(
	messages: OpenCodeSessionMessage[],
	message: OpenCodeSessionMessage,
	updater?: (existing: OpenCodeSessionMessage) => OpenCodeSessionMessage,
): OpenCodeSessionMessage[] {
	const index = messages.findIndex((item) => item.id === message.id);

	if (index === -1) {
		return [...messages, message];
	}

	const next = [...messages];
	next[index] = updater ? updater(next[index]) : message;
	return next;
}

function mergeMessageContent(
	current: string,
	text: string,
	wasDelta?: string,
): string {
	if (wasDelta) {
		return `${current}${text}`;
	}

	if (!current) {
		return text;
	}

	if (current.includes(text)) {
		return current;
	}

	return `${current}\n\n${text}`;
}

function extractTextFromPart(part: Part, delta?: string): string | null {
	if (delta) {
		return delta;
	}

	if ("text" in part && typeof part.text === "string") {
		return part.text;
	}

	if (part.type === "subtask") {
		return part.prompt;
	}

	return null;
}

function mapSessionStatus(status: SessionStatus): OpenCodeSessionStatus {
	if (status.type === "busy") {
		return "running";
	}

	if (status.type === "retry") {
		return "queued";
	}

	return "completed";
}

function createFallbackSession(sessionId: string): OpenCodeSessionState {
	return {
		id: sessionId,
		status: "unknown",
		startedAt: new Date().toISOString(),
		messages: [],
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
