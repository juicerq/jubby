import { History, Loader2, Play, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "../../types";
import type { GenerateSubtasksResult } from "../../useTasksStorage";

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
	onGenerateSubtasks: () => Promise<GenerateSubtasksResult | null>;
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
	const { canRunAll, hasDescription, hasWaitingSubtasks, handleGenerate } =
		useSubtaskHeaderState({
			task,
			hasWorkingDirectory,
			isExecuting,
			onGenerateSubtasks,
		});

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

			<button
				type="button"
				onClick={handleGenerate}
				disabled={isGenerating || isExecuting || !hasDescription}
				className={cn(
					"flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
					isGenerating || isExecuting || !hasDescription
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
			</button>

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

function useSubtaskHeaderState({
	task,
	hasWorkingDirectory,
	isExecuting,
	onGenerateSubtasks,
}: {
	task: Task;
	hasWorkingDirectory: boolean;
	isExecuting: boolean;
	onGenerateSubtasks: () => Promise<GenerateSubtasksResult | null>;
}) {
	const hasWaitingSubtasks = task.subtasks.some((s) => s.status === "waiting");
	const hasDescription = task.description.trim().length > 0;
	const canRunAll = hasWorkingDirectory && hasWaitingSubtasks && !isExecuting;

	const handleGenerate = async () => {
		await onGenerateSubtasks();
	};

	return { canRunAll, hasDescription, hasWaitingSubtasks, handleGenerate };
}

export { SubtaskHeaderActions };
export type { SubtaskHeaderActionsProps };
