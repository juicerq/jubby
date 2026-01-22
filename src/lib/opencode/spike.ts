import { createOpencodeClient } from "@opencode-ai/sdk/v2";

export async function runOpencodeSpike() {
	const client = createOpencodeClient({
		baseUrl: "http://127.0.0.1:4096",
	});

	const health = await client.global.health();
	const session = await client.session.create({
		title: "Spike",
	});
	const events = await client.global.event();

	return {
		health,
		session,
		events,
	};
}
