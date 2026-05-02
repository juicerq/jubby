import { type } from "arktype";
import { Store } from "@main/store/Store";

const windowBoundsSchema = type({
	x: "number",
	y: "number",
	width: "number",
	height: "number",
	maximized: "boolean",
});

const settingsContract = type({
	"windowBounds?": windowBoundsSchema,
	"lastFolderId?": "string",
});

export const settingsUpdateSchema = type({
	"windowBounds?": windowBoundsSchema,
	"lastFolderId?": "string",
});

type SettingsValue = typeof settingsContract.infer;
type SettingsUpdate = typeof settingsUpdateSchema.infer;

const store = new Store({
	name: "settings",
	version: 1,
	contract: settingsContract,
	migrators: {},
	seed: (): SettingsValue => ({}),
});

export const Settings = {
	get: () => store.read(),
	update: (patch: SettingsUpdate) =>
		store.mutate((current) => ({ ...current, ...patch })),
};
