import type { PluginManifest } from "@/core/types";
import { PromptEnhancerManifest } from "./prompt-enhancer";
import { QuickClipManifest } from "./quickclip";
import { TasksManifest } from "./tasks";

export const plugins: PluginManifest[] = [
	TasksManifest,
	QuickClipManifest,
	PromptEnhancerManifest,
];
