import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";

import { OPENCODE_BASE_URL } from "./constants";

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_INITIAL_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 2_000;

let client: OpencodeClient | null = null;

type WaitForServerOptions = {
	maxAttempts?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
};

export function getClient(): OpencodeClient {
	if (!client) {
		client = createOpencodeClient({ baseUrl: OPENCODE_BASE_URL });
	}

	return client;
}

export async function isConnected(): Promise<boolean> {
	try {
		const result = await getClient().global.health({ throwOnError: true });

		return Boolean(result.data.healthy);
	} catch {
		return false;
	}
}

export async function waitForServer(
	options: WaitForServerOptions = {},
): Promise<boolean> {
	const {
		maxAttempts = DEFAULT_MAX_ATTEMPTS,
		initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
		maxDelayMs = DEFAULT_MAX_DELAY_MS,
	} = options;

	let delay = initialDelayMs;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		if (await isConnected()) {
			return true;
		}

		if (attempt < maxAttempts) {
			await sleep(delay);
			delay = Math.min(delay * 2, maxDelayMs);
		}
	}

	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
