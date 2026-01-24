import {
	Blocks,
	CheckCircle,
	ChevronRight,
	History,
	Lightbulb,
	Loader2,
	Play,
	Sparkles,
	Square,
	Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModelId, ModelOption } from "../../constants";
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
		hoverClass: "focus:bg-amber-500/10 focus:text-amber-400",
	},
	{
		id: "architecture",
		label: "Architecture",
		icon: Blocks,
		colorClass: "text-blue-400",
		hoverClass: "focus:bg-blue-500/10 focus:text-blue-400",
	},
	{
		id: "review",
		label: "Review",
		icon: CheckCircle,
		colorClass: "text-green-400",
		hoverClass: "focus:bg-green-500/10 focus:text-green-400",
	},
];

interface SubtaskHeaderActionsProps {
	task: Task;
	modelOptions: ModelOption[];
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
	modelOptions,
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
	const hasWaitingSubtasks = task.subtasks.some((s) => s.status === "waiting");
	const hasDescription = task.description.trim().length > 0;
	const hasModelOptions = modelOptions.length > 0;
	const canRunAll =
		hasWorkingDirectory &&
		hasWaitingSubtasks &&
		!isExecuting &&
		hasModelOptions;
	const canGenerate =
		!isGenerating && !isExecuting && hasDescription && hasModelOptions;

	const handleSelectModel = async (modelId: ModelId) => {
		await onGenerateSubtasks(modelId);
	};

	const handleSelectRunAllModel = (modelId: ModelId) => {
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

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={isExecuting}
						className={cn(
							"group flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
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
						<ChevronRight className="h-3 w-3 transition-transform duration-150 group-data-[state=open]:rotate-90" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					sideOffset={4}
					collisionPadding={8}
					className="w-[160px] py-1"
				>
					{OPENCODE_MODE_OPTIONS.map((option) => {
						const Icon = option.icon;
						return (
							<DropdownMenuItem
								key={option.id}
								onClick={() => onOpenOpencodeTerminal(option.id)}
								className={cn(
									"gap-2 px-3 py-1.5 text-[12px]",
									option.colorClass,
									option.hoverClass,
								)}
							>
								<Icon className={cn("h-3 w-3", option.colorClass)} />
								{option.label}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={!canGenerate}
						className={cn(
							"group flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
							!canGenerate
								? "cursor-not-allowed bg-white/4 text-white/25"
								: "cursor-pointer bg-violet-500/15 text-violet-400 hover:bg-violet-500/25",
						)}
						aria-label="Generate subtasks with AI"
						title={
							!hasDescription
								? "Add a description first"
								: !hasModelOptions
									? "No models available"
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
						<ChevronRight className="h-3 w-3 transition-transform duration-150 group-data-[state=open]:rotate-90" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					sideOffset={4}
					collisionPadding={8}
					className="w-[160px] py-1"
				>
					{modelOptions.map((option) => (
						<DropdownMenuItem
							key={option.id}
							onClick={() => handleSelectModel(option.id)}
							className="gap-2 px-3 py-1.5 text-[12px] text-violet-400 focus:bg-violet-500/10 focus:text-violet-400"
						>
							<Sparkles className="h-3 w-3 text-violet-400" />
							{option.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

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
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							disabled={!canRunAll}
							className={cn(
								"group flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
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
										: !hasModelOptions
											? "No models available"
											: isExecuting
												? "Execution in progress"
												: "Run all waiting subtasks"
							}
						>
							<Play className="h-3 w-3 fill-current" />
							Run All
							<ChevronRight className="h-3 w-3 transition-transform duration-150 group-data-[state=open]:rotate-90" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						sideOffset={4}
						collisionPadding={8}
						className="w-[160px] py-1"
					>
						{modelOptions.map((option) => (
							<DropdownMenuItem
								key={option.id}
								onClick={() => handleSelectRunAllModel(option.id)}
								className="gap-2 px-3 py-1.5 text-[12px] text-emerald-400 focus:bg-emerald-500/10 focus:text-emerald-400"
							>
								<Play className="h-3 w-3 fill-emerald-400 text-emerald-400" />
								{option.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}

export { SubtaskHeaderActions };
export type { SubtaskHeaderActionsProps };
