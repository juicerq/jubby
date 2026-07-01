import { type } from "arktype";
import { base } from "@main/router/_base";
import { Tasks } from "@main/store/data";

export const tasksRouter = {
	listByFolder: base
		.input(type({ folderId: "string", "tagIds?": "string[]" }))
		.handler(({ input }) => Tasks.listByFolder(input)),

	heatmap: base.handler(() => Tasks.heatmap()),

	create: base
		.input(
			type({
				folderId: "string",
				title: "string > 0",
				"description?": "string",
				"tagIds?": "string[]",
			}),
		)
		.handler(({ input }) => Tasks.create(input)),

	update: base
		.input(
			type({
				id: "string",
				"title?": "string > 0",
				"description?": "string",
				"tagIds?": "string[]",
			}),
		)
		.handler(({ input }) => Tasks.update(input)),

	cycleStatus: base
		.input(type({ id: "string" }))
		.handler(({ input }) => Tasks.cycleStatus(input)),

	stop: base
		.input(type({ id: "string" }))
		.handler(({ input }) => Tasks.stop(input)),

	delete: base
		.input(type({ id: "string" }))
		.handler(({ input }) => Tasks.delete(input)),
};
