import { Logger } from "@main/logger";
import { os } from "@orpc/server";
import { type } from "arktype";

export const base = os.use(async ({ next, path }) => {
	try {
		return await next();
	} catch (err) {
		Logger.error(`orpc:${path.join(".")}`, { err: String(err) });
		throw err;
	}
});

export const noInput = base.input(type("undefined"));
