import { type } from "arktype";
import { base } from "@main/router/_base";
import { Grills } from "@main/store/grills";

export const grillsRouter = {
	list: base
		.input(type({ projectPath: "string > 0" }))
		.handler(({ input }) => Grills.list(input)),
};
