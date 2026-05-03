import { createGroq } from "@ai-sdk/groq";
import { Output, generateText, jsonSchema as aiJsonSchema } from "ai";
import { type } from "arktype";
import { buildSystemPrompt } from "@main/entity/prompt";
import {
	type EntityContext,
	type EntityResponse,
	entityResponseSchema,
	expressions,
} from "@main/entity/schema";
import { Logger } from "@main/logger";
import { EntityKey } from "@main/store/entity-key";

const GLITCHED_RESPONSE: EntityResponse = {
	react: true,
	expression: "glitched",
	message: "[SIGNAL LOST]",
};

const groqSchema = aiJsonSchema<EntityResponse>(
	{
		type: "object",
		properties: {
			react: { type: "boolean" },
			expression: { type: "string", enum: [...expressions] },
			message: { type: "string" },
		},
		required: ["react", "expression", "message"],
		additionalProperties: false,
	},
	{
		validate: (value) => {
			const out = entityResponseSchema(value);
			if (out instanceof type.errors) {
				return { success: false as const, error: new Error(out.summary) };
			}
			return { success: true as const, value: out };
		},
	},
);

export async function reactToContext(
	context: EntityContext,
): Promise<EntityResponse> {
	const apiKey = EntityKey.get();
	if (!apiKey) {
		return GLITCHED_RESPONSE;
	}

	const groq = createGroq({ apiKey });

	try {
		const { output } = await generateText({
			model: groq("openai/gpt-oss-20b"),
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
