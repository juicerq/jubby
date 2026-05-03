import { entityRouter } from "@main/router/entity";
import { foldersRouter } from "@main/router/folders";
import { loggerRouter } from "@main/router/logger";
import { settingsRouter } from "@main/router/settings";
import { systemRouter } from "@main/router/system";
import { tasksRouter } from "@main/router/tasks";
import { windowRouter } from "@main/router/window";

export const router = {
	entity: entityRouter,
	logger: loggerRouter,
	settings: settingsRouter,
	system: systemRouter,
	folders: foldersRouter,
	tasks: tasksRouter,
	window: windowRouter,
};

export type Router = typeof router;
