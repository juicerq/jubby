export const entityMoods = [
	"neutro",
	"irritado",
	"eufórico",
	"filosófico",
	"preguiçoso",
	"sarcástico",
	"carinhoso",
] as const;

export type EntityMood = (typeof entityMoods)[number];

export const entityExpressions = [
	"neutral",
	"happy",
	"excited",
	"sleepy",
	"grumpy",
	"curious",
	"shocked",
	"glitched",
] as const;

export type EntityExpression = (typeof entityExpressions)[number];

export const entityEventTypes = [
	"task:created",
	"task:completed",
	"idle",
	"window:return",
] as const;

export type EntityEventType = (typeof entityEventTypes)[number];
