import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { useCallback, useState } from "react";

import { getClient } from "./client";
import type { OpenCodeSessionState } from "./state";
import { useOpenCodeSessionsStore } from "./state";
import type { OpenCodeSessionId } from "./types";

type ResponseData<T> = T extends { data: infer U } ? U : T;
type CreateSessionParams = Parameters<OpencodeClient["session"]["create"]>[0];
type CreateSessionResponse = Awaited<
	ReturnType<OpencodeClient["session"]["create"]>
>;
type PromptParams = Parameters<OpencodeClient["session"]["prompt"]>[0];
type PromptResponse = Awaited<ReturnType<OpencodeClient["session"]["prompt"]>>;
type AbortParams = Parameters<OpencodeClient["session"]["abort"]>[0];
type AbortResponse = Awaited<ReturnType<OpencodeClient["session"]["abort"]>>;

type MutationState<T> = {
	isLoading: boolean;
	error: Error | null;
	data: T | null;
};

export type OpenCodeStatus = {
	currentSessionId: OpenCodeSessionId | null;
	currentSession: OpenCodeSessionState | undefined;
	hasSessions: boolean;
	isRunning: boolean;
};

export function useOpenCodeSession(
	sessionId?: OpenCodeSessionId | null,
): OpenCodeSessionState | undefined {
	return useOpenCodeSessionsStore((state) => {
		const resolvedId = sessionId ?? state.currentSessionId;
		if (!resolvedId) {
			return undefined;
		}

		return state.sessions.get(resolvedId);
	});
}

export function useOpenCodeStatus(): OpenCodeStatus {
	return useOpenCodeSessionsStore((state) => {
		const sessions = Array.from(state.sessions.values());
		const currentSession = state.currentSessionId
			? state.sessions.get(state.currentSessionId)
			: undefined;
		const isRunning = sessions.some(
			(session) => session.status === "running" || session.status === "queued",
		);
		return {
			currentSessionId: state.currentSessionId,
			currentSession,
			hasSessions: sessions.length > 0,
			isRunning,
		};
	});
}

export function useCreateSession() {
	const [state, setState] = useState<
		MutationState<ResponseData<CreateSessionResponse>>
	>({
		isLoading: false,
		error: null,
		data: null,
	});

	const createSession = useCallback(async (params: CreateSessionParams) => {
		setState({ isLoading: true, error: null, data: null });

		try {
			const response = await getClient().session.create(params);
			const data = extractResponseData(response);
			setState({ isLoading: false, error: null, data });
			return data;
		} catch (error) {
			const nextError =
				error instanceof Error ? error : new Error(String(error));
			setState({ isLoading: false, error: nextError, data: null });
			throw nextError;
		}
	}, []);

	return {
		createSession,
		...state,
	};
}

export function useSendPrompt() {
	const [state, setState] = useState<
		MutationState<ResponseData<PromptResponse>>
	>({
		isLoading: false,
		error: null,
		data: null,
	});

	const sendPrompt = useCallback(async (params: PromptParams) => {
		setState({ isLoading: true, error: null, data: null });

		try {
			const response = await getClient().session.prompt(params);
			const data = extractResponseData(response);
			setState({ isLoading: false, error: null, data });
			return data;
		} catch (error) {
			const nextError =
				error instanceof Error ? error : new Error(String(error));
			setState({ isLoading: false, error: nextError, data: null });
			throw nextError;
		}
	}, []);

	return {
		sendPrompt,
		...state,
	};
}

export function useAbortSession() {
	const [state, setState] = useState<
		MutationState<ResponseData<AbortResponse>>
	>({
		isLoading: false,
		error: null,
		data: null,
	});

	const abortSession = useCallback(async (params: AbortParams) => {
		setState({ isLoading: true, error: null, data: null });

		try {
			const response = await getClient().session.abort(params);
			const data = extractResponseData(response);
			setState({ isLoading: false, error: null, data });
			return data;
		} catch (error) {
			const nextError =
				error instanceof Error ? error : new Error(String(error));
			setState({ isLoading: false, error: nextError, data: null });
			throw nextError;
		}
	}, []);

	return {
		abortSession,
		...state,
	};
}

function extractResponseData<T>(response: T): ResponseData<T> {
	if (response && typeof response === "object" && "data" in response) {
		return (response as { data: ResponseData<T> }).data;
	}

	return response as ResponseData<T>;
}
