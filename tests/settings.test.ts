import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Settings } from "@main/store/settings";
import { assertDefined } from "./utils/assertions";

function settingsPath(): string {
	assertDefined(process.env.DATA_DIR);
	return join(process.env.DATA_DIR, "settings.json");
}

describe("settings", () => {
	it("seeds with empty object when the file is missing", async () => {
		const settings = await Settings.get();
		expect(settings).toEqual({});
	});

	it("persists lastFolderId and reads it back", async () => {
		await Settings.update({ lastFolderId: "abc-123" });
		const read = await Settings.get();
		expect(read.lastFolderId).toBe("abc-123");
	});

	it("preserves untouched fields when patching one", async () => {
		await Settings.update({
			windowBounds: { x: 0, y: 0, width: 800, height: 600, maximized: false },
		});
		const after = await Settings.update({ lastFolderId: "f-1" });

		expect(after.lastFolderId).toBe("f-1");
		expect(after.windowBounds?.width).toBe(800);
	});

	it("rejects when settings.json is malformed JSON", async () => {
		writeFileSync(settingsPath(), "{not-json");
		await expect(Settings.get()).rejects.toThrow();
	});

	it("rejects when the envelope shape is wrong", async () => {
		writeFileSync(settingsPath(), JSON.stringify({ unrelated: "shape" }));
		await expect(Settings.get()).rejects.toThrow();
	});

	it("rejects when the stored value violates the contract", async () => {
		writeFileSync(
			settingsPath(),
			JSON.stringify({ version: 1, data: { windowBounds: "not-an-object" } }),
		);
		await expect(Settings.get()).rejects.toThrow();
	});
});
