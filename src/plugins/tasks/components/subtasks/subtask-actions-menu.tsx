import {
	Check,
	History,
	MoreHorizontal,
	Pencil,
	Play,
	Square,
	Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModelId, ModelOption } from "../../constants";

interface SubtaskActionsMenuProps {
	workingDirectory: string;
	modelOptions: ModelOption[];
	isThisExecuting: boolean;
	isExecuting: boolean;
	isPendingDelete: boolean;
	hasHistory: boolean;
	hasWorkingDirectory: boolean;
	onExecute: (modelId?: string) => void;
	onAbort: () => void;
	onEdit: () => void;
	onViewHistory: () => void;
	onDelete: () => void;
}

function SubtaskActionsMenu({
	workingDirectory: _workingDirectory,
	modelOptions,
	isThisExecuting,
	isExecuting,
	isPendingDelete,
	hasHistory,
	hasWorkingDirectory,
	onExecute,
	onAbort,
	onEdit,
	onViewHistory,
	onDelete,
}: SubtaskActionsMenuProps) {
	const canRun = hasWorkingDirectory && !isExecuting && modelOptions.length > 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					onClick={(e) => e.stopPropagation()}
					className={cn(
						"flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-all duration-150 ease-out active:scale-90",
						"opacity-0 hover:bg-white/8 group-hover/subtask:opacity-100 data-[state=open]:bg-white/10 data-[state=open]:opacity-100",
					)}
					aria-label="Actions"
				>
					<MoreHorizontal className="h-3 w-3 text-white/40" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="end"
				sideOffset={4}
				collisionPadding={8}
				className="w-[160px] py-1"
				onClick={(e) => e.stopPropagation()}
			>
				{isThisExecuting ? (
					<DropdownMenuItem
						onClick={onAbort}
						className="gap-2 px-3 py-1.5 text-[12px] text-red-400 focus:bg-red-500/10 focus:text-red-400"
					>
						<Square className="h-3 w-3 fill-red-400" />
						Stop
					</DropdownMenuItem>
				) : (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger
							disabled={!canRun}
							className={cn(
								"gap-2 px-3 py-1.5 text-[12px]",
								!canRun
									? "cursor-not-allowed text-white/30 focus:bg-transparent focus:text-white/30"
									: "text-emerald-400 focus:bg-emerald-500/10 focus:text-emerald-400 data-[state=open]:bg-emerald-500/10 data-[state=open]:text-emerald-400",
							)}
							title={
								!hasWorkingDirectory
									? "Set working directory in settings first"
									: modelOptions.length === 0
										? "No models available"
										: isExecuting
											? "Execution in progress"
											: "Run this subtask"
							}
						>
							<Play
								className={cn(
									"h-3 w-3",
									!canRun ? "fill-white/30" : "fill-emerald-400",
								)}
							/>
							Run
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent
							sideOffset={4}
							collisionPadding={8}
							className="w-[160px] py-1"
						>
							{modelOptions.map((option) => (
								<DropdownMenuItem
									key={option.id}
									onClick={() => onExecute(option.id as ModelId)}
									className="gap-2 px-3 py-1.5 text-[12px] text-emerald-400 focus:bg-emerald-500/10 focus:text-emerald-400"
								>
									<Play className="h-3 w-3 fill-emerald-400" />
									{option.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}

				<DropdownMenuItem
					onClick={onEdit}
					className="gap-2 px-3 py-1.5 text-[12px] text-white/70"
				>
					<Pencil className="h-3 w-3 text-white/50" />
					Edit
				</DropdownMenuItem>

				{hasHistory && (
					<DropdownMenuItem
						onClick={onViewHistory}
						className="gap-2 px-3 py-1.5 text-[12px] text-white/70"
					>
						<History className="h-3 w-3 text-white/50" />
						View History
					</DropdownMenuItem>
				)}

				<DropdownMenuSeparator className="mx-2 my-1 bg-white/[0.06]" />

				<DropdownMenuItem
					onClick={(e) => {
						if (!isPendingDelete) {
							e.preventDefault();
						}
						onDelete();
					}}
					className={cn(
						"gap-2 px-3 py-1.5 text-[12px]",
						isPendingDelete
							? "bg-red-500/20 text-red-400 focus:bg-red-500/20 focus:text-red-400"
							: "text-red-400 focus:bg-red-500/10 focus:text-red-400",
					)}
				>
					{isPendingDelete ? (
						<>
							<Check className="h-3 w-3 text-red-400" />
							Confirm
						</>
					) : (
						<>
							<Trash2 className="h-3 w-3 text-red-400" />
							Delete
						</>
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { SubtaskActionsMenu };
export type { SubtaskActionsMenuProps };
