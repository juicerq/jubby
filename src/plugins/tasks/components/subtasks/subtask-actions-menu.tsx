import {
	Check,
	ChevronRight,
	History,
	MoreHorizontal,
	Pencil,
	Play,
	Square,
	Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MODEL_OPTIONS, type ModelId } from "../../constants";
import { useClickOutside } from "../../hooks/use-click-outside";

interface SubtaskActionsMenuProps {
	workingDirectory: string;
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
	const [isOpen, setIsOpen] = useState(false);
	const [isRunSubmenuOpen, setIsRunSubmenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useClickOutside(
		menuRef,
		() => {
			setIsOpen(false);
			setIsRunSubmenuOpen(false);
		},
		isOpen,
	);

	const handleSelectModel = (modelId: ModelId) => {
		onExecute(modelId);
		setIsOpen(false);
		setIsRunSubmenuOpen(false);
	};

	return (
		<div className="relative" ref={menuRef}>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					setIsOpen(!isOpen);
				}}
				className={cn(
					"flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-all duration-150 ease-out active:scale-90",
					isOpen
						? "bg-white/10 opacity-100"
						: "opacity-0 hover:bg-white/8 group-hover/subtask:opacity-100",
				)}
				aria-label="Actions"
			>
				<MoreHorizontal className="h-3 w-3 text-white/40" />
			</button>

			{isOpen && (
				<div className="absolute right-0 top-full z-20 mt-1 w-[140px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg">
					{isThisExecuting ? (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onAbort();
								setIsOpen(false);
							}}
							className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] text-red-400 transition-colors hover:bg-red-500/10"
						>
							<Square className="h-3 w-3 fill-red-400" />
							Stop
						</button>
					) : (
						<div className="relative">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									if (hasWorkingDirectory && !isExecuting) {
										setIsRunSubmenuOpen(!isRunSubmenuOpen);
									}
								}}
								disabled={!hasWorkingDirectory || isExecuting}
								title={
									!hasWorkingDirectory
										? "Set working directory in settings first"
										: isExecuting
											? "Execution in progress"
											: "Run this subtask"
								}
								className={cn(
									"flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] transition-colors",
									!hasWorkingDirectory || isExecuting
										? "cursor-not-allowed text-white/30"
										: "cursor-pointer text-emerald-400 hover:bg-emerald-500/10",
								)}
							>
								<span className="flex items-center gap-2">
									<Play
										className={cn(
											"h-3 w-3",
											!hasWorkingDirectory || isExecuting
												? "fill-white/30"
												: "fill-emerald-400",
										)}
									/>
									Run
								</span>
								<ChevronRight
									className={cn(
										"h-3 w-3",
										!hasWorkingDirectory || isExecuting
											? "text-white/30"
											: "text-emerald-400",
									)}
								/>
							</button>

							{isRunSubmenuOpen && (
								<div className="absolute left-full top-0 z-30 ml-1 w-[140px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg">
									{MODEL_OPTIONS.map((option) => (
										<button
											key={option.id}
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleSelectModel(option.id);
											}}
											className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] text-emerald-400 transition-colors hover:bg-emerald-500/10"
										>
											<Play className="h-3 w-3 fill-emerald-400" />
											{option.label}
										</button>
									))}
								</div>
							)}
						</div>
					)}

					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onEdit();
							setIsOpen(false);
						}}
						className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] text-white/70 transition-colors hover:bg-white/6"
					>
						<Pencil className="h-3 w-3 text-white/50" />
						Edit
					</button>

					{hasHistory && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onViewHistory();
								setIsOpen(false);
							}}
							className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] text-white/70 transition-colors hover:bg-white/6"
						>
							<History className="h-3 w-3 text-white/50" />
							View History
						</button>
					)}

					<div className="mx-2 my-1 border-t border-white/[0.06]" />

					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
							if (isPendingDelete) {
								setIsOpen(false);
							}
						}}
						className={cn(
							"flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
							isPendingDelete
								? "bg-red-500/20 text-red-400"
								: "text-red-400 hover:bg-red-500/10",
						)}
					>
						{isPendingDelete ? (
							<>
								<Check className="h-3 w-3" />
								Confirm
							</>
						) : (
							<>
								<Trash2 className="h-3 w-3" />
								Delete
							</>
						)}
					</button>
				</div>
			)}
		</div>
	);
}

export { SubtaskActionsMenu };
export type { SubtaskActionsMenuProps };
