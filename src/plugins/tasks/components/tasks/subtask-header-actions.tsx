import {
	Blocks,
	CheckCircle,
	ChevronDown,
	History,
	Lightbulb,
	Loader2,
	Play,
	Sparkles,
	Square,
	Terminal,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MODEL_OPTIONS, type ModelId } from "../../constants";
import { useClickOutside } from "../../hooks/use-click-outside";
import type { OpencodeMode, Task } from "../../types";
import type { GenerateSubtasksResult } from "../../useTasksStorage";

const OPENCODE_MODE_OPTIONS: {
	id: OpencodeMode;
	label: string;
	icon: typeof Lightbulb;
	colorClass: string;
	hoverClass: string;
}[] = [
	{
		id: "brainstorm",
		label: "Brainstorm",
		icon: Lightbulb,
		colorClass: "text-amber-400",
		hoverClass: "hover:bg-amber-500/10",
	},
	{
		id: "architecture",
		label: "Architecture",
		icon: Blocks,
		colorClass: "text-blue-400",
		hoverClass: "hover:bg-blue-500/10",
	},
	{
		id: "review",
		label: "Review",
		icon: CheckCircle,
		colorClass: "text-green-400",
		hoverClass: "hover:bg-green-500/10",
	},
];

interface SubtaskHeaderActionsProps {
	task: Task;
	isLooping: boolean;
	isExecuting: boolean;
	isGenerating: boolean;
	hasAnyHistory: boolean;
	hasWorkingDirectory: boolean;
	onStartLoop: (modelId?: string) => void;
	onStopLoop: () => void;
	onOpenHistory: () => void;
	onGenerateSubtasks: (
		modelId: string,
	) => Promise<GenerateSubtasksResult | null>;
	onOpenOpencodeTerminal: (mode?: OpencodeMode) => Promise<void>;
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
	onOpenOpencodeTerminal,
}: SubtaskHeaderActionsProps) {
	const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
	const [isOpencodeDropdownOpen, setIsOpencodeDropdownOpen] = useState(false);
	const [isRunAllDropdownOpen, setIsRunAllDropdownOpen] = useState(false);
	const modelDropdownRef = useRef<HTMLDivElement>(null);
	const opencodeDropdownRef = useRef<HTMLDivElement>(null);
	const runAllDropdownRef = useRef<HTMLDivElement>(null);

	useClickOutside(
		modelDropdownRef,
		() => setIsModelDropdownOpen(false),
		isModelDropdownOpen,
	);

	useClickOutside(
		opencodeDropdownRef,
		() => setIsOpencodeDropdownOpen(false),
		isOpencodeDropdownOpen,
	);

	useClickOutside(
		runAllDropdownRef,
		() => setIsRunAllDropdownOpen(false),
		isRunAllDropdownOpen,
	);

	const hasWaitingSubtasks = task.subtasks.some((s) => s.status === "waiting");
	const hasDescription = task.description.trim().length > 0;
	const canRunAll = hasWorkingDirectory && hasWaitingSubtasks && !isExecuting;
	const canGenerate = !isGenerating && !isExecuting && hasDescription;

	const handleSelectModel = async (modelId: ModelId) => {
		setIsModelDropdownOpen(false);
		await onGenerateSubtasks(modelId);
	};

	const handleSelectRunAllModel = (modelId: ModelId) => {
		setIsRunAllDropdownOpen(false);
		onStartLoop(modelId);
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

			<div className="relative" ref={opencodeDropdownRef}>
				<button
					type="button"
					onClick={() =>
						!isExecuting && setIsOpencodeDropdownOpen(!isOpencodeDropdownOpen)
					}
					disabled={isExecuting}
					className={cn(
						"flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
						isExecuting
							? "cursor-not-allowed bg-white/4 text-white/25"
							: "cursor-pointer bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25",
					)}
					aria-label="Open OpenCode in terminal"
					title={
						isExecuting
							? "Execution in progress"
							: "Open OpenCode in terminal with task context"
					}
				>
					<Terminal className="h-3 w-3" />
					OpenCode
					<ChevronDown className="h-3 w-3 -mr-0.5" />
				</button>

				{isOpencodeDropdownOpen && (
					<div className="absolute right-0 top-full z-20 mt-1 w-[140px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg">
						{OPENCODE_MODE_OPTIONS.map((option) => {
							const Icon = option.icon;
							return (
								<button
									key={option.id}
									type="button"
									onClick={() => {
										setIsOpencodeDropdownOpen(false);
										onOpenOpencodeTerminal(option.id);
									}}
									className={cn(
										"flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
										option.colorClass,
										option.hoverClass,
									)}
								>
									<Icon className="h-3 w-3" />
									{option.label}
								</button>
							);
						})}
					</div>
				)}
			</div>

			<div className="relative" ref={modelDropdownRef}>
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
				<div className="relative" ref={runAllDropdownRef}>
					<button
						type="button"
						onClick={() =>
							canRunAll && setIsRunAllDropdownOpen(!isRunAllDropdownOpen)
						}
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
						<ChevronDown className="h-3 w-3 -mr-0.5" />
					</button>

					{isRunAllDropdownOpen && (
						<div className="absolute right-0 top-full z-20 mt-1 w-[140px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg">
							{MODEL_OPTIONS.map((option) => (
								<button
									key={option.id}
									type="button"
									onClick={() => handleSelectRunAllModel(option.id)}
									className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] text-emerald-400 transition-colors hover:bg-emerald-500/10"
								>
									<Play className="h-3 w-3 fill-current" />
									{option.label}
								</button>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export { SubtaskHeaderActions };
export type { SubtaskHeaderActionsProps };
