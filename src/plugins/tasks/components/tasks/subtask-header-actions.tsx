import {
	ChevronDown,
	History,
	Loader2,
	Play,
	Sparkles,
	Square,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "../../hooks/use-click-outside";
import type { Task } from "../../types";
import type { GenerateSubtasksResult } from "../../useTasksStorage";

const MODEL_OPTIONS = [
	{ id: "openai/gpt-5.2-codex", label: "GPT-5.2 Codex" },
	{ id: "anthropic/claude-opus-4-5", label: "Opus 4.5" },
	{ id: "anthropic/claude-sonnet-4-5", label: "Sonnet 4.5" },
	{ id: "anthropic/claude-haiku-4-5", label: "Haiku 4.5" },
] as const;

type ModelId = (typeof MODEL_OPTIONS)[number]["id"];

interface SubtaskHeaderActionsProps {
	task: Task;
	isLooping: boolean;
	isExecuting: boolean;
	isGenerating: boolean;
	hasAnyHistory: boolean;
	hasWorkingDirectory: boolean;
	onStartLoop: () => void;
	onStopLoop: () => void;
	onOpenHistory: () => void;
	onGenerateSubtasks: (
		modelId: string,
	) => Promise<GenerateSubtasksResult | null>;
}

function SubtaskHeaderActions({
	task,
	isLooping,
	isExecuting,
	isGenerating,
	hasAnyHistory,
	hasWorkingDirectory,
	onStartLoop,
	onStopLoop,
	onOpenHistory,
	onGenerateSubtasks,
}: SubtaskHeaderActionsProps) {
	const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useClickOutside(
		dropdownRef,
		() => setIsModelDropdownOpen(false),
		isModelDropdownOpen,
	);

	const hasWaitingSubtasks = task.subtasks.some((s) => s.status === "waiting");
	const hasDescription = task.description.trim().length > 0;
	const canRunAll = hasWorkingDirectory && hasWaitingSubtasks && !isExecuting;
	const canGenerate = !isGenerating && !isExecuting && hasDescription;

	const handleSelectModel = async (modelId: ModelId) => {
		setIsModelDropdownOpen(false);
		await onGenerateSubtasks(modelId);
	};

	return (
		<div className="flex items-center gap-1.5">
			{hasAnyHistory && (
				<button
					type="button"
					onClick={onOpenHistory}
					className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md bg-white/6 px-2 text-[11px] font-medium text-white/40 transition-all duration-150 ease-out hover:bg-white/10 hover:text-white/60 active:scale-[0.96]"
					aria-label="View execution history"
				>
					<History className="h-3 w-3" />
					View history
				</button>
			)}

			<div className="relative" ref={dropdownRef}>
				<button
					type="button"
					onClick={() =>
						canGenerate && setIsModelDropdownOpen(!isModelDropdownOpen)
					}
					disabled={!canGenerate}
					className={cn(
						"flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
						!canGenerate
							? "cursor-not-allowed bg-white/4 text-white/25"
							: "cursor-pointer bg-violet-500/15 text-violet-400 hover:bg-violet-500/25",
					)}
					aria-label="Generate subtasks with AI"
					title={
						!hasDescription
							? "Add a description first"
							: isGenerating
								? "Generating..."
								: isExecuting
									? "Execution in progress"
									: "Generate subtasks with AI"
					}
				>
					{isGenerating ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<Sparkles className="h-3 w-3" />
					)}
					{isGenerating ? "Generating..." : "Generate"}
					{!isGenerating && <ChevronDown className="h-3 w-3 -mr-0.5" />}
				</button>

				{isModelDropdownOpen && (
					<div className="absolute right-0 top-full z-20 mt-1 w-[140px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg">
						{MODEL_OPTIONS.map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => handleSelectModel(option.id)}
								className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] text-violet-400 transition-colors hover:bg-violet-500/10"
							>
								<Sparkles className="h-3 w-3" />
								{option.label}
							</button>
						))}
					</div>
				)}
			</div>

			{isLooping ? (
				<button
					type="button"
					onClick={onStopLoop}
					className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md bg-red-500/15 px-2 text-[11px] font-medium text-red-400 transition-all duration-150 ease-out hover:bg-red-500/25 active:scale-[0.96]"
					aria-label="Stop loop"
				>
					<Square className="h-3 w-3 fill-red-400" />
					Stop
				</button>
			) : (
				<button
					type="button"
					onClick={onStartLoop}
					disabled={!canRunAll}
					className={cn(
						"flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
						!canRunAll
							? "cursor-not-allowed bg-white/4 text-white/25"
							: "cursor-pointer bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
					)}
					aria-label="Run all waiting subtasks"
					title={
						!hasWorkingDirectory
							? "Set working directory in settings first"
							: !hasWaitingSubtasks
								? "No waiting subtasks"
								: isExecuting
									? "Execution in progress"
									: "Run all waiting subtasks"
					}
				>
					<Play className="h-3 w-3 fill-current" />
					Run All
				</button>
			)}
		</div>
	);
}

export { SubtaskHeaderActions };
export type { SubtaskHeaderActionsProps };
