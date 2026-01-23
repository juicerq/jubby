import type { LucideIcon } from "lucide-react";
import {
	BookOpen,
	Bug,
	Code,
	FileType,
	RefreshCw,
	TestTube,
	Trash2,
} from "lucide-react";
import type { SubtaskCategory } from "./types";

export const CATEGORY_ICONS: Record<SubtaskCategory, LucideIcon> = {
	functional: Code,
	test: TestTube,
	types: FileType,
	fix: Bug,
	refactor: RefreshCw,
	cleanup: Trash2,
	docs: BookOpen,
};

export const TAG_COLORS = [
	{ name: "Red", hex: "#ef4444", contrastText: "white" },
	{ name: "Orange", hex: "#f97316", contrastText: "white" },
	{ name: "Yellow", hex: "#eab308", contrastText: "#0a0a0a" },
	{ name: "Green", hex: "#22c55e", contrastText: "white" },
	{ name: "Blue", hex: "#3b82f6", contrastText: "white" },
	{ name: "Purple", hex: "#8b5cf6", contrastText: "white" },
	{ name: "Pink", hex: "#ec4899", contrastText: "white" },
	{ name: "Gray", hex: "#6b7280", contrastText: "white" },
] as const;

export const FOLDER_NAME_MAX_LENGTH = 25;
