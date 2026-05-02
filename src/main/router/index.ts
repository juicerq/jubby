import { foldersRouter } from "@main/router/folders";
import { loggerRouter } from "@main/router/logger";
import { settingsRouter } from "@main/router/settings";
import { systemRouter } from "@main/router/system";
import { tasksRouter } from "@main/router/tasks";

export const router = {
	logger: loggerRouter,
	settings: settingsRouter,
	system: systemRouter,
	folders: foldersRouter,
	tasks: tasksRouter,
};

export type Router = typeof router;
