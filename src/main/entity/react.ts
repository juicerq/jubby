import { createGroq } from "@ai-sdk/groq";
import { Output, generateText, jsonSchema as aiJsonSchema } from "ai";
import { type } from "arktype";
import { buildSystemPrompt } from "@main/entity/prompt";
import {
	type EntityContext,
	type EntityResponse,
	entityRawResponseSchema,
} from "@main/entity/schema";
import { Logger } from "@main/logger";
import { EntityKey } from "@main/store/entity-key";

const GLITCHED_RESPONSE: EntityResponse = {
	react: true,
	expression: "glitched",
	message: "[SIGNAL LOST]",
};

const groqSchema = aiJsonSchema<EntityResponse>(
	entityRawResponseSchema.toJsonSchema(),
	{
		validate: (value) => {
			const out = entityRawResponseSchema(value);
			if (out instanceof type.errors) {
				return { success: false as const, error: new Error(out.summary) };
			}
			const normalized: EntityResponse = out.react
				? {
						react: true,
						expression: out.expression,
						message: out.message,
					}
				: { react: false };
			return { success: true as const, value: normalized };
		},
	},
);

let cachedGroq: {
	apiKey: string;
	client: ReturnType<typeof createGroq>;
} | null = null;

function getGroq(apiKey: string) {
	if (cachedGroq?.apiKey !== apiKey) {
		cachedGroq = { apiKey, client: createGroq({ apiKey }) };
	}
	return cachedGroq.client;
}

export async function reactToContext(
	context: EntityContext,
): Promise<EntityResponse> {
	const apiKey = EntityKey.get();
	if (!apiKey) {
		return GLITCHED_RESPONSE;
	}

	try {
		const { output } = await generateText({
			model: getGroq(apiKey)("openai/gpt-oss-20b"),
			output: Output.object({ schema: groqSchema }),
			system: buildSystemPrompt(context.session.mood),
			prompt: JSON.stringify(context),
		});

		return output;
	} catch (err: any) {
		Logger.error("entity:react", { err: String(err) });
		return GLITCHED_RESPONSE;
	}
}
