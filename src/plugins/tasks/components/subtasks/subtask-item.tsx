import { Check, GripVertical, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type {
	Step,
	Subtask,
	SubtaskCategory,
	SubtaskStatus,
} from "../../types";
import { SubtaskActionsMenu } from "./subtask-actions-menu";
import { SubtaskCategoryBadge } from "./subtask-category-badge";
import { SubtaskDetails } from "./subtask-details";
import { SubtaskStatusBadge } from "./subtask-status-badge";
import { SubtaskSteps } from "./subtask-steps";

interface SubtaskItemProps {
	subtask: Subtask;
	onUpdateStatus: (status: SubtaskStatus) => void;
	onDeleteClick: () => void;
	isPendingDelete: boolean;
	onUpdateText: (text: string) => void;
	onUpdateCategory: (category: SubtaskCategory) => void;
	onUpdateShouldCommit: (shouldCommit: boolean) => void;
	onCreateStep: (text: string) => void;
	onToggleStep: (stepId: string) => void;
	onDeleteStep: (stepId: string) => void;
	onUpdateStepText: (stepId: string, text: string) => void;
	onExecute: () => void;
	onAbort: () => void;
	onViewHistory: () => void;
	isExecuting: boolean;
	isThisExecuting: boolean;
	hasWorkingDirectory: boolean;
	isDragging?: boolean;
	isAnyDragging?: boolean;
	onMouseDown?: (e: React.MouseEvent) => void;
	itemRef?: (el: HTMLDivElement | null) => void;
}

function SubtaskItem({
	subtask,
	onUpdateStatus,
	onDeleteClick,
	isPendingDelete,
	onUpdateText,
	onUpdateCategory,
	onUpdateShouldCommit,
	onCreateStep,
	onToggleStep,
	onDeleteStep,
	onUpdateStepText,
	onExecute,
	onAbort,
	onViewHistory,
	isExecuting,
	isThisExecuting,
	hasWorkingDirectory,
	isDragging = false,
	isAnyDragging = false,
	onMouseDown,
	itemRef,
}: SubtaskItemProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(subtask.text);
	const [newStepValue, setNewStepValue] = useState("");
	const [editingStepId, setEditingStepId] = useState<string | null>(null);
	const [editingStepValue, setEditingStepValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const stepInputRef = useRef<HTMLInputElement>(null);
	const editStepInputRef = useRef<HTMLInputElement>(null);

	const isCompleted = subtask.status === "completed";
	const isInProgress = subtask.status === "in_progress";

	useEffect(() => {
		setEditValue(subtask.text);
	}, [subtask.text]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	useEffect(() => {
		if (editingStepId && editStepInputRef.current) {
			editStepInputRef.current.focus();
			editStepInputRef.current.select();
		}
	}, [editingStepId]);

	const handleToggle = () => {
		onUpdateStatus(isCompleted ? "waiting" : "completed");
	};

	const handleSave = () => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== subtask.text) {
			onUpdateText(trimmed);
		} else {
			setEditValue(subtask.text);
		}
		setIsEditing(false);
	};

	const handleCancel = () => {
		setEditValue(subtask.text);
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSave();
		} else if (e.key === "Escape") {
			e.preventDefault();
			handleCancel();
		}
	};

	const handleRowClick = (e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		if (
			target.closest("button") ||
			target.closest("input") ||
			target.closest("textarea")
		) {
			return;
		}
		setIsExpanded((prev) => !prev);
	};

	const handleAddStep = () => {
		const trimmed = newStepValue.trim();
		if (trimmed) {
			onCreateStep(trimmed);
			setNewStepValue("");
			stepInputRef.current?.focus();
		}
	};

	const handleStepKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAddStep();
		}
	};

	const handleStartEditStep = (step: Step) => {
		setEditingStepId(step.id);
		setEditingStepValue(step.text);
	};

	const handleSaveStepEdit = () => {
		if (editingStepId) {
			const trimmed = editingStepValue.trim();
			if (trimmed) {
				onUpdateStepText(editingStepId, trimmed);
			}
			setEditingStepId(null);
			setEditingStepValue("");
		}
	};

	const handleCancelStepEdit = () => {
		setEditingStepId(null);
		setEditingStepValue("");
	};

	const handleStepEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSaveStepEdit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			handleCancelStepEdit();
		}
	};

	return (
		<div
			ref={itemRef}
			className={cn(
				"group/subtask flex flex-col rounded-md p-1 transition-all duration-150 ease-out hover:bg-white/[0.03]",
				isDragging && "opacity-40 scale-[0.98] pointer-events-none",
				isExpanded && "bg-white/[0.04]",
				isInProgress && "neon-border-executing",
			)}
		>
			<div
				className="flex cursor-pointer items-center gap-2 py-1.5 pr-1"
				onClick={handleRowClick}
			>
				<div
					onMouseDown={onMouseDown}
					onClick={(e) => e.stopPropagation()}
					className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center"
				>
					<GripVertical className="h-3 w-3 text-white/15 transition-colors duration-150 group-hover/subtask:text-white/30" />
				</div>

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						handleToggle();
					}}
					className={cn(
						"flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded border transition-all duration-150 ease-out active:scale-[0.9]",
						isCompleted
							? "border-white/50 bg-white/50"
							: subtask.status === "failed"
								? "border-red-500/50 bg-red-500/10 hover:border-red-500/70"
								: "border-white/25 bg-transparent hover:border-white/40",
					)}
					aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
				>
					{isCompleted && <Check className="h-2 w-2 text-[#0a0a0a]" />}
					{subtask.status === "failed" && (
						<X className="h-2 w-2 text-red-400" />
					)}
				</button>

				{isEditing ? (
					<input
						ref={inputRef}
						type="text"
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onBlur={handleSave}
						onClick={(e) => e.stopPropagation()}
						className="flex-1 bg-transparent text-[12px] leading-tight tracking-[-0.01em] text-white/70 outline-none"
						autoComplete="off"
					/>
				) : (
					<span
						className={cn(
							"flex-1 text-[12px] leading-tight tracking-[-0.01em] transition-all duration-150 ease-out",
							isCompleted
								? "text-white/30 line-through decoration-white/20"
								: "text-white/70",
							isAnyDragging && "select-none",
						)}
					>
						{subtask.text}
					</span>
				)}

				<SubtaskCategoryBadge category={subtask.category} />
				<SubtaskStatusBadge status={subtask.status} />

				<SubtaskActionsMenu
					isThisExecuting={isThisExecuting}
					isExecuting={isExecuting}
					isPendingDelete={isPendingDelete}
					hasHistory={subtask.executionLogs.length > 0}
					hasWorkingDirectory={hasWorkingDirectory}
					onExecute={onExecute}
					onAbort={onAbort}
					onEdit={() => setIsEditing(true)}
					onViewHistory={onViewHistory}
					onDelete={onDeleteClick}
				/>
			</div>

			<AnimatePresence>
				{isExpanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-3 px-6 pb-3 pt-1">
							<div className="h-px bg-white/8" />

							<SubtaskSteps
								steps={subtask.steps}
								newStepValue={newStepValue}
								onNewStepValueChange={setNewStepValue}
								onStepKeyDown={handleStepKeyDown}
								onToggleStep={onToggleStep}
								onDeleteStep={onDeleteStep}
								onStartEditStep={handleStartEditStep}
								editingStepId={editingStepId}
								editingStepValue={editingStepValue}
								onEditingStepValueChange={setEditingStepValue}
								onSaveStepEdit={handleSaveStepEdit}
								onStepEditKeyDown={handleStepEditKeyDown}
								stepInputRef={stepInputRef}
								editStepInputRef={editStepInputRef}
							/>

							<div className="h-px bg-white/8" />

							<SubtaskDetails
								category={subtask.category}
								shouldCommit={subtask.shouldCommit}
								notes={subtask.notes}
								subtask={subtask}
								onUpdateCategory={onUpdateCategory}
								onUpdateShouldCommit={onUpdateShouldCommit}
							/>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export { SubtaskItem };
export type { SubtaskItemProps };
