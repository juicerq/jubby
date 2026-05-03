import { type } from "arktype";

const moods = [
	"neutro",
	"irritado",
	"eufórico",
	"filosófico",
	"preguiçoso",
	"sarcástico",
	"carinhoso",
] as const;

export type Mood = (typeof moods)[number];

export const expressions = [
	"neutral",
	"happy",
	"excited",
	"sleepy",
	"grumpy",
	"curious",
	"shocked",
	"glitched",
] as const;

const entityContextSchema = type({
	events: type({
		type: "'boot' | 'task:created' | 'task:completed' | 'idle' | 'window:return'",
		"data?": "unknown",
		timestamp: "number",
	}).array(),
	state: {
		pendingTasks: "number",
		completedToday: "number",
		totalFolders: "number",
		"currentFolder?": "string",
	},
	"content?": {
		"taskTitle?": "string",
		"folderName?": "string",
	},
	session: {
		mood: type.enumerated(...moods),
		bootTime: "number",
		"awayDuration?": "number",
	},
});

export type EntityContext = typeof entityContextSchema.infer;

export const entityReactInput = type({
	events: type({
		type: "'boot' | 'task:created' | 'task:completed' | 'idle' | 'window:return'",
		"data?": "unknown",
		timestamp: "number",
	}).array(),
	"content?": {
		"taskTitle?": "string",
		"folderName?": "string",
	},
	session: {
		mood: type.enumerated(...moods),
		bootTime: "number",
		"awayDuration?": "number",
	},
});

export const entityResponseSchema = type({
	react: "boolean",
	expression: type.enumerated(...expressions),
	message: "string",
});

export type EntityResponse = typeof entityResponseSchema.infer;
