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
});

export const settingsUpdateSchema = type({
	"windowBounds?": windowBoundsSchema,
});

export type SettingsValue = typeof settingsContract.infer;
type SettingsUpdate = typeof settingsUpdateSchema.infer;

const store = new Store({
	name: "settings",
	version: 2,
	contract: settingsContract,
	migrators: {
		1: (raw) => {
			const { lastFolderId: _lastFolderId, ...rest } = raw as Record<
				string,
				unknown
			>;
			return rest;
		},
	},
	seed: (): SettingsValue => ({}),
});

export const Settings = {
	get: () => store.read(),
	update: (patch: SettingsUpdate) =>
		store.mutate((current) => ({ ...current, ...patch })),
};
