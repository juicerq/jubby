import { type } from "arktype";
import { base } from "@main/router/_base";
import { Tasks } from "@main/store/data";

export const tasksRouter = {
	listByFolder: base
		.input(type({ folderId: "string", "tagIds?": "string[]" }))
		.handler(({ input }) => Tasks.listByFolder(input)),

	listPending: base
		.input(type({ "tagIds?": "string[]" }))
		.handler(({ input }) => Tasks.listPending(input)),

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

	toggleDone: base
		.input(type({ id: "string" }))
		.handler(({ input }) => Tasks.toggleDone(input)),

	delete: base
		.input(type({ id: "string" }))
		.handler(({ input }) => Tasks.delete(input)),
};
