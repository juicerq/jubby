import { type } from "arktype";
import { base } from "@main/router/_base";
import { Tags, tagColorSchema } from "@main/store/data";

export const tagsRouter = {
	list: base.handler(() => Tags.list()),

	create: base
		.input(
			type({
				name: "string > 0",
				"color?": tagColorSchema,
			}),
		)
		.handler(({ input }) => Tags.create(input)),

	rename: base
		.input(type({ id: "string", name: "string > 0" }))
		.handler(({ input }) => Tags.rename(input)),

	recolor: base
		.input(type({ id: "string", color: tagColorSchema }))
		.handler(({ input }) => Tags.recolor(input)),

	delete: base
		.input(type({ id: "string" }))
		.handler(({ input }) => Tags.delete(input)),
};
