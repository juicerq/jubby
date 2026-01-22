import { create } from "zustand";

import type { OpenCodeSessionId, OpenCodeSessionStatus } from "./types";

export interface OpenCodeSessionMessage {
	id: string;
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	createdAt: string;
}

export interface OpenCodeSessionState {
	id: OpenCodeSessionId;
	status: OpenCodeSessionStatus;
	taskId?: string;
	subtaskId?: string;
	startedAt: string;
	messages: OpenCodeSessionMessage[];
}

interface OpenCodeSessionsStore {
	sessions: Map<OpenCodeSessionId, OpenCodeSessionState>;
	currentSessionId: OpenCodeSessionId | null;
	addSession: (session: OpenCodeSessionState) => void;
	updateSession: (
		id: OpenCodeSessionId,
		updater: (session: OpenCodeSessionState) => OpenCodeSessionState,
	) => void;
	removeSession: (id: OpenCodeSessionId) => void;
	getSession: (id: OpenCodeSessionId) => OpenCodeSessionState | undefined;
	getCurrentSession: () => OpenCodeSessionState | undefined;
	getSessionByTask: (taskId: string) => OpenCodeSessionState | undefined;
}

export const useOpenCodeSessionsStore = create<OpenCodeSessionsStore>(
	(set, get) => ({
		sessions: new Map(),
		currentSessionId: null,
		addSession: (session) =>
			set((state) => {
				const sessions = new Map(state.sessions);
				sessions.set(session.id, session);
				return {
					sessions,
					currentSessionId: session.id,
				};
			}),
		updateSession: (id, updater) =>
			set((state) => {
				const existing = state.sessions.get(id);
				if (!existing) {
					return state;
				}

				const updated = updater(existing);
				const sessions = new Map(state.sessions);
				sessions.set(id, updated);
				return { sessions };
			}),
		removeSession: (id) =>
			set((state) => {
				if (!state.sessions.has(id)) {
					return state;
				}

				const sessions = new Map(state.sessions);
				sessions.delete(id);
				return {
					sessions,
					currentSessionId:
						state.currentSessionId === id ? null : state.currentSessionId,
				};
			}),
		getSession: (id) => get().sessions.get(id),
		getCurrentSession: () => {
			const { currentSessionId, sessions } = get();
			if (!currentSessionId) {
				return undefined;
			}
			return sessions.get(currentSessionId);
		},
		getSessionByTask: (taskId) => {
			for (const session of get().sessions.values()) {
				if (session.taskId === taskId) {
					return session;
				}
			}
			return undefined;
		},
	}),
);
