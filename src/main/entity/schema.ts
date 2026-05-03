import {
	type EntityExpression,
	entityEventTypes,
	entityExpressions,
	entityMoods,
} from "@shared/entity-constants";
import { type } from "arktype";

export type { EntityMood as Mood } from "@shared/entity-constants";

const eventDataSchema = type({
	"taskTitle?": "string",
	"folderName?": "string",
});

const eventSchema = type({
	type: type.enumerated(...entityEventTypes),
	"data?": eventDataSchema,
	timestamp: "number",
});

const sessionSchema = type({
	mood: type.enumerated(...entityMoods),
	bootTime: "number",
	"awayDuration?": "number",
});

export const entityReactInput = type({
	"+": "reject",
	events: eventSchema.array(),
	session: sessionSchema,
});

export type EntityContext = typeof entityReactInput.infer & {
	state: {
		pendingTasks: number;
		completedToday: number;
		totalFolders: number;
	};
};

// Forma achatada exigida pelo Groq Structured Output (sem anyOf/oneOf no top level).
// Normalizada para uma união discriminada em `react.ts`.
export const entityRawResponseSchema = type({
	"+": "reject",
	react: "boolean",
	expression: type.enumerated(...entityExpressions),
	message: "string",
});

export type EntityResponse =
	| { react: false }
	| { react: true; expression: EntityExpression; message: string };
