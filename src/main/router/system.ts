import { base } from "@main/router/_base";
import { dataStore } from "@main/store/data";

export const systemRouter = {
	stats: base.handler(() => dataStore.stats()),
};
