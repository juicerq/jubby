import { type } from "arktype";
import { dialog } from "electron";
import { base } from "@main/router/_base";
import { dataStore } from "@main/store/data";
import { inspectProject } from "@main/store/grills";
import { getMainWindow } from "@main/window";

export const systemRouter = {
	stats: base.handler(() => dataStore.stats()),

	pickDirectory: base.handler(async () => {
		const win = getMainWindow();
		const result = win
			? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
			: await dialog.showOpenDialog({ properties: ["openDirectory"] });

		if (result.canceled || result.filePaths.length === 0) {
			return { path: null };
		}

		return { path: result.filePaths[0] };
	}),

	inspectProject: base
		.input(type({ projectPath: "string" }))
		.handler(({ input }) => inspectProject(input.projectPath)),
};
