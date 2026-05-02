import { type } from "arktype";
import { base } from "@main/router/_base";
import { Folders } from "@main/store/data";

export const foldersRouter = {
	list: base.handler(() => Folders.list()),

	create: base
		.input(type({ name: "string > 0" }))
		.handler(({ input }) => Folders.create(input)),

	rename: base
		.input(type({ id: "string", name: "string > 0" }))
		.handler(({ input }) => Folders.rename(input)),

	delete: base
		.input(type({ id: "string" }))
		.handler(({ input }) => Folders.delete(input)),
};
