import { Check } from "lucide-react";
import type { PluginManifest } from "@/core/types";
import { TasksPlugin } from "./TasksPlugin";

export const TasksManifest: PluginManifest = {
	id: "tasks",
	name: "Tasks",
	description: "Manage tasks with subtasks, tags and status tracking",
	icon: Check,
	component: TasksPlugin,
	version: "1.0.0",
};
