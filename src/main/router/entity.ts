import { reactToContext } from "@main/entity/react";
import { entityReactInput } from "@main/entity/schema";
import { base } from "@main/router/_base";
import { EntityStats } from "@main/store/data";
import { EntityKey } from "@main/store/entity-key";
import { type } from "arktype";

export const entityRouter = {
	hasApiKey: base.handler(() => EntityKey.has()),

	setApiKey: base.input(type({ key: "string > 0" })).handler(({ input }) => {
		EntityKey.set(input.key);
	}),

	react: base.input(entityReactInput).handler(async ({ input }) => {
		const state = await EntityStats.get();
		return reactToContext({ ...input, state });
	}),
};
