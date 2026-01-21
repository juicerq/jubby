import {
	Check,
	Code2,
	Loader2,
	Minus,
	Pencil,
	Play,
	Sparkles,
	Square,
	TestTube2,
	Trash2,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
	TasksPluginSubtaskInput,
	TasksPluginSubtaskList,
	TasksPluginTagBadge,
	TasksPluginTagEditorPopover,
} from "./TasksPlugin";
import type {
	SubtaskCategory,
	SubtaskStatus,
	Tag as TagType,
	Task,
	TaskStatus,
} from "./types";
import { type GeneratedSubtask, usePendingDelete } from "./useTasksStorage";

interface TasksPluginTaskDetailProps {
	task: Task;
	tags: TagType[];
	onDeleteTask: (id: string) => Promise<void>;
	onUpdateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
	onUpdateTaskText: (id: string, text: string) => Promise<void>;
	onSetTaskTags: (taskId: string, tagIds: string[]) => Promise<void>;
	onCreateSubtask: (taskId: string, text: string) => Promise<void>;
	onUpdateSubtaskStatus: (
		taskId: string,
		subtaskId: string,
		status: SubtaskStatus,
	) => Promise<void>;
	onDeleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	onReorderSubtasks: (taskId: string, subtaskIds: string[]) => Promise<void>;
	onUpdateSubtaskText: (
		taskId: string,
		subtaskId: string,
		text: string,
	) => Promise<void>;
	onUpdateSubtaskCategory: (
		taskId: string,
		subtaskId: string,
		category: SubtaskCategory,
	) => Promise<void>;
	onUpdateSubtaskNotes: (
		taskId: string,
		subtaskId: string,
		notes: string,
	) => Promise<void>;
	onUpdateSubtaskShouldCommit: (
		taskId: string,
		subtaskId: string,
		shouldCommit: boolean,
	) => Promise<void>;
	onCreateStep: (
		taskId: string,
		subtaskId: string,
		text: string,
	) => Promise<void>;
	onToggleStep: (
		taskId: string,
		subtaskId: string,
		stepId: string,
	) => Promise<void>;
	onDeleteStep: (
		taskId: string,
		subtaskId: string,
		stepId: string,
	) => Promise<void>;
	onUpdateStepText: (
		taskId: string,
		subtaskId: string,
		stepId: string,
		text: string,
	) => Promise<void>;
	onExecuteSubtask: (taskId: string, subtaskId: string) => void;
	onAbortExecution: () => void;
	isExecuting: boolean;
	executingSubtaskId: string | null;
	isLooping: boolean;
	onStartLoop: (taskId: string) => void;
	onStopLoop: () => void;
	onNavigateBack: () => void;
	onGenerateSubtasks: (taskId: string) => Promise<GeneratedSubtask[] | null>;
	onCreateSubtaskBatch: (
		taskId: string,
		subtasks: GeneratedSubtask[],
	) => Promise<void>;
	isGenerating: boolean;
}

function TasksPluginTaskDetail({
	task,
	tags,
	onDeleteTask,
	onUpdateTaskStatus,
	onUpdateTaskText,
	onSetTaskTags,
	onCreateSubtask,
	onUpdateSubtaskStatus,
	onDeleteSubtask,
	onReorderSubtasks,
	onUpdateSubtaskText,
	onUpdateSubtaskCategory,
	onUpdateSubtaskNotes,
	onUpdateSubtaskShouldCommit,
	onCreateStep,
	onToggleStep,
	onDeleteStep,
	onUpdateStepText,
	onExecuteSubtask,
	onAbortExecution,
	isExecuting,
	executingSubtaskId,
	isLooping,
	onStartLoop,
	onStopLoop,
	onNavigateBack,
	onGenerateSubtasks,
	onCreateSubtaskBatch,
	isGenerating,
}: TasksPluginTaskDetailProps) {
	const {
		pendingId: pendingDeleteId,
		handleDeleteClick,
		cancelDelete,
	} = usePendingDelete(async (id: string) => {
		await onDeleteTask(id);
		onNavigateBack();
	});

	const isPendingDelete = pendingDeleteId === task.id;

	const handleToggleTag = (tagId: string) => {
		const currentTagIds = task.tagIds ?? [];
		const newTagIds = currentTagIds.includes(tagId)
			? currentTagIds.filter((id) => id !== tagId)
			: [...currentTagIds, tagId];
		onSetTaskTags(task.id, newTagIds);
	};

	return (
		<div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
			<section>
				<TasksPluginTaskDetailSectionHeader
					title="Task"
					right={
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								cancelDelete();
								handleDeleteClick(task.id);
							}}
							className={cn(
								"flex h-6 w-6 items-center justify-center rounded-md border border-transparent transition-all duration-150 ease-out active:scale-90 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
								isPendingDelete
									? "bg-red-500/20 text-red-500"
									: "text-white/40 hover:bg-red-500/15 hover:text-red-500",
							)}
							aria-label={isPendingDelete ? "Confirm delete" : "Delete task"}
						>
							{isPendingDelete ? (
								<Check className="h-3.5 w-3.5" />
							) : (
								<X className="h-3.5 w-3.5" />
							)}
						</button>
					}
				/>

				<TasksPluginTaskInfo
					task={task}
					tags={tags}
					onUpdateTaskStatus={onUpdateTaskStatus}
					onUpdateTaskText={onUpdateTaskText}
					onToggleTag={handleToggleTag}
				/>
			</section>

			<section className="flex flex-1 flex-col overflow-hidden">
				<TasksPluginTaskDetailSectionHeader
					title="Subtasks"
					right={
						<TasksPluginSubtaskHeaderActions
							task={task}
							isLooping={isLooping}
							isExecuting={isExecuting}
							isGenerating={isGenerating}
							onStartLoop={() => onStartLoop(task.id)}
							onStopLoop={onStopLoop}
							onGenerateSubtasks={onGenerateSubtasks}
							onCreateSubtaskBatch={onCreateSubtaskBatch}
						/>
					}
				/>

				<div className="flex flex-1 flex-col gap-2 overflow-y-auto">
					<TasksPluginSubtaskInput
						onCreateSubtask={(text) => onCreateSubtask(task.id, text)}
					/>
					<TasksPluginSubtaskList
						subtasks={task.subtasks}
						onUpdateSubtaskStatus={(subtaskId, status) =>
							onUpdateSubtaskStatus(task.id, subtaskId, status)
						}
						onDeleteSubtask={(subtaskId) => onDeleteSubtask(task.id, subtaskId)}
						onReorderSubtasks={(subtaskIds) =>
							onReorderSubtasks(task.id, subtaskIds)
						}
						onUpdateSubtaskText={(subtaskId, text) =>
							onUpdateSubtaskText(task.id, subtaskId, text)
						}
						onUpdateSubtaskCategory={(subtaskId, category) =>
							onUpdateSubtaskCategory(task.id, subtaskId, category)
						}
						onUpdateSubtaskNotes={(subtaskId, notes) =>
							onUpdateSubtaskNotes(task.id, subtaskId, notes)
						}
						onUpdateSubtaskShouldCommit={(subtaskId, shouldCommit) =>
							onUpdateSubtaskShouldCommit(task.id, subtaskId, shouldCommit)
						}
						onCreateStep={(subtaskId, text) =>
							onCreateStep(task.id, subtaskId, text)
						}
						onToggleStep={(subtaskId, stepId) =>
							onToggleStep(task.id, subtaskId, stepId)
						}
						onDeleteStep={(subtaskId, stepId) =>
							onDeleteStep(task.id, subtaskId, stepId)
						}
						onUpdateStepText={(subtaskId, stepId, text) =>
							onUpdateStepText(task.id, subtaskId, stepId, text)
						}
						onExecuteSubtask={(subtaskId) =>
							onExecuteSubtask(task.id, subtaskId)
						}
						onAbortExecution={onAbortExecution}
						isExecuting={isExecuting}
						executingSubtaskId={executingSubtaskId}
					/>
				</div>
			</section>
		</div>
	);
}

interface TasksPluginTaskDetailSectionHeaderProps {
	title: string;
	right?: React.ReactNode;
}

function TasksPluginTaskDetailSectionHeader({
	title,
	right,
}: TasksPluginTaskDetailSectionHeaderProps) {
	return (
		<div className="mb-2 flex items-center justify-between">
			<h2 className="text-[12px] font-medium uppercase tracking-wide text-white/40">
				{title}
			</h2>
			{right}
		</div>
	);
}

interface TasksPluginTaskInfoProps {
	task: Task;
	tags: TagType[];
	onUpdateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
	onUpdateTaskText: (id: string, text: string) => Promise<void>;
	onToggleTag: (tagId: string) => void;
}

function TasksPluginTaskInfo({
	task,
	tags,
	onUpdateTaskStatus,
	onUpdateTaskText,
	onToggleTag,
}: TasksPluginTaskInfoProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(task.text);
	const [isEditingTags, setIsEditingTags] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setEditValue(task.text);
	}, [task.text]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleSave = () => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== task.text) {
			onUpdateTaskText(task.id, trimmed);
		} else {
			setEditValue(task.text);
		}
		setIsEditing(false);
	};

	const handleCancel = () => {
		setEditValue(task.text);
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

	const getNextStatus = (current: TaskStatus): TaskStatus => {
		switch (current) {
			case "pending":
				return "in_progress";
			case "in_progress":
				return "completed";
			case "completed":
				return "pending";
		}
	};

	const handleStatusClick = () => {
		onUpdateTaskStatus(task.id, getNextStatus(task.status));
	};

	const taskTags = (task.tagIds ?? [])
		.map((tagId) => tags.find((t) => t.id === tagId))
		.filter((t): t is TagType => t !== undefined);

	const hasTags = tags.length > 0;

	return (
		<div className="flex flex-col gap-2 rounded-lg bg-white/[0.02] px-3 py-3">
			<div className="flex items-start gap-3">
				<button
					type="button"
					className={cn(
						"mt-0.5 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] transition-all duration-150 ease-out active:scale-[0.92]",
						"active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						task.status === "completed" &&
							"border-white/90 bg-white/90 hover:border-white/75 hover:bg-white/75",
						task.status === "in_progress" &&
							"border-amber-500 bg-amber-500/20 hover:border-amber-400 hover:bg-amber-500/30",
						task.status === "pending" &&
							"border-white/25 bg-transparent hover:border-white/45 hover:bg-white/4",
					)}
					onClick={handleStatusClick}
					aria-label={
						task.status === "pending"
							? "Mark as in progress"
							: task.status === "in_progress"
								? "Mark as complete"
								: "Mark as pending"
					}
				>
					{task.status === "completed" && (
						<Check className="h-3 w-3 text-[#0a0a0a]" />
					)}
					{task.status === "in_progress" && (
						<Minus className="h-3 w-3 text-amber-500" />
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
						className="h-[22px] flex-1 bg-transparent text-[13px] font-normal leading-[1.4] tracking-[-0.01em] text-white/90 outline-none"
						autoComplete="off"
					/>
				) : (
					<span
						className={cn(
							"flex-1 truncate text-[13px] font-normal leading-[1.4] tracking-[-0.01em] transition-all duration-150 ease-out",
							task.status === "completed" &&
								"text-white/35 line-through decoration-white/25",
							task.status === "in_progress" && "text-amber-200/90",
							task.status === "pending" && "text-white/90",
						)}
					>
						{task.text}
					</span>
				)}

				<button
					type="button"
					onClick={() => setIsEditing(true)}
					className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/70 active:scale-90"
					aria-label="Edit task"
				>
					<Pencil className="h-3.5 w-3.5" />
				</button>
			</div>

			{hasTags && (
				<div className="relative ml-[30px]">
					<button
						type="button"
						onClick={() => setIsEditingTags(!isEditingTags)}
						className={cn(
							"flex flex-wrap items-center gap-1 rounded-md border border-transparent p-0.5 -m-0.5 transition-all duration-150 ease-out active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
							isEditingTags
								? "border-white/15 bg-white/4"
								: "hover:border-white/10 hover:bg-white/4",
						)}
						aria-label="Edit tags"
					>
						{taskTags.length > 0 ? (
							taskTags.map((tag) => (
								<TasksPluginTagBadge
									key={tag.id}
									tag={tag}
									isCompleted={task.status === "completed"}
								/>
							))
						) : (
							<span className="px-1 text-[11px] text-white/25">+ Add tags</span>
						)}
					</button>

					{isEditingTags && (
						<TasksPluginTagEditorPopover
							tags={tags}
							selectedTagIds={task.tagIds ?? []}
							onToggleTag={onToggleTag}
							onClose={() => setIsEditingTags(false)}
						/>
					)}
				</div>
			)}
		</div>
	);
}

interface TasksPluginSubtaskHeaderActionsProps {
	task: Task;
	isLooping: boolean;
	isExecuting: boolean;
	isGenerating: boolean;
	onStartLoop: () => void;
	onStopLoop: () => void;
	onGenerateSubtasks: (taskId: string) => Promise<GeneratedSubtask[] | null>;
	onCreateSubtaskBatch: (
		taskId: string,
		subtasks: GeneratedSubtask[],
	) => Promise<void>;
}

function TasksPluginSubtaskHeaderActions({
	task,
	isLooping,
	isExecuting,
	isGenerating,
	onStartLoop,
	onStopLoop,
	onGenerateSubtasks,
	onCreateSubtaskBatch,
}: TasksPluginSubtaskHeaderActionsProps) {
	const [previewSubtasks, setPreviewSubtasks] = useState<GeneratedSubtask[]>(
		[],
	);
	const [isPreviewOpen, setIsPreviewOpen] = useState(false);

	const handleGenerate = async () => {
		const result = await onGenerateSubtasks(task.id);
		if (result && result.length > 0) {
			setPreviewSubtasks(result);
			setIsPreviewOpen(true);
		}
	};

	const handleConfirmGenerated = async () => {
		await onCreateSubtaskBatch(task.id, previewSubtasks);
		setIsPreviewOpen(false);
		setPreviewSubtasks([]);
	};

	const handleRemovePreviewSubtask = (index: number) => {
		setPreviewSubtasks((prev) => prev.filter((_, i) => i !== index));
	};

	const handleClosePreview = () => {
		setIsPreviewOpen(false);
		setPreviewSubtasks([]);
	};

	const hasWaitingSubtasks = task.subtasks.some((s) => s.status === "waiting");
	const hasDescription = task.description.trim().length > 0;

	return (
		<>
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					onClick={handleGenerate}
					disabled={isGenerating || isExecuting || !hasDescription}
					className={cn(
						"flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
						isGenerating || isExecuting || !hasDescription
							? "cursor-not-allowed bg-white/4 text-white/25"
							: "bg-violet-500/15 text-violet-400 hover:bg-violet-500/25",
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
						className="flex h-6 items-center gap-1.5 rounded-md bg-red-500/15 px-2 text-[11px] font-medium text-red-400 transition-all duration-150 ease-out hover:bg-red-500/25 active:scale-[0.96]"
						aria-label="Stop loop"
					>
						<Square className="h-3 w-3 fill-red-400" />
						Stop
					</button>
				) : (
					<button
						type="button"
						onClick={onStartLoop}
						disabled={isExecuting || !hasWaitingSubtasks}
						className={cn(
							"flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-all duration-150 ease-out active:scale-[0.96]",
							isExecuting || !hasWaitingSubtasks
								? "cursor-not-allowed bg-white/4 text-white/25"
								: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
						)}
						aria-label="Run all waiting subtasks"
						title={
							!hasWaitingSubtasks
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

			<AnimatePresence>
				{isPreviewOpen && previewSubtasks.length > 0 && (
					<TasksPluginGeneratePreviewModal
						subtasks={previewSubtasks}
						onConfirm={handleConfirmGenerated}
						onRemove={handleRemovePreviewSubtask}
						onClose={handleClosePreview}
					/>
				)}
			</AnimatePresence>
		</>
	);
}

interface TasksPluginGeneratePreviewModalProps {
	subtasks: GeneratedSubtask[];
	onConfirm: () => void;
	onRemove: (index: number) => void;
	onClose: () => void;
}

function TasksPluginGeneratePreviewModal({
	subtasks,
	onConfirm,
	onRemove,
	onClose,
}: TasksPluginGeneratePreviewModalProps) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.15 }}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<motion.div
				initial={{ opacity: 0, scale: 0.95, y: 10 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				exit={{ opacity: 0, scale: 0.95, y: 10 }}
				transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
				className="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0c] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15">
							<Sparkles className="h-4 w-4 text-violet-400" />
						</div>
						<div>
							<h2 className="text-[14px] font-semibold tracking-tight text-white/90">
								Generated Subtasks
							</h2>
							<p className="text-[11px] text-white/40">
								{subtasks.length} subtask{subtasks.length > 1 ? "s" : ""} ready
								to add
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 hover:bg-white/8 hover:text-white/70 active:scale-95"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto p-4">
					<div className="flex flex-col gap-2">
						{subtasks.map((subtask, index) => (
							<TasksPluginGeneratePreviewItem
								key={`${subtask.text}-${index}`}
								subtask={subtask}
								onRemove={() => onRemove(index)}
							/>
						))}
					</div>
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
					<button
						type="button"
						onClick={onClose}
						className="h-8 rounded-md px-4 text-[12px] font-medium text-white/50 transition-all duration-150 hover:bg-white/6 hover:text-white/70 active:scale-[0.98]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={subtasks.length === 0}
						className="flex h-8 items-center gap-2 rounded-md bg-violet-500/20 px-4 text-[12px] font-medium text-violet-300 transition-all duration-150 hover:bg-violet-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Check className="h-3.5 w-3.5" />
						Add {subtasks.length} Subtask{subtasks.length > 1 ? "s" : ""}
					</button>
				</div>
			</motion.div>
		</motion.div>
	);
}

interface TasksPluginGeneratePreviewItemProps {
	subtask: GeneratedSubtask;
	onRemove: () => void;
}

function TasksPluginGeneratePreviewItem({
	subtask,
	onRemove,
}: TasksPluginGeneratePreviewItemProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const hasDetails =
		subtask.steps.length > 0 || subtask.notes.trim().length > 0;

	return (
		<div className="group flex flex-col rounded-lg border border-white/6 bg-white/[0.02] transition-all duration-150 hover:border-white/10 hover:bg-white/[0.03]">
			<div
				className={cn(
					"flex items-start gap-3 p-3",
					hasDetails && "cursor-pointer",
				)}
				onClick={() => hasDetails && setIsExpanded((prev) => !prev)}
			>
				<div
					className={cn(
						"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded",
						subtask.category === "functional"
							? "bg-sky-500/15 text-sky-400"
							: "bg-violet-500/15 text-violet-400",
					)}
				>
					{subtask.category === "functional" ? (
						<Code2 className="h-3 w-3" />
					) : (
						<TestTube2 className="h-3 w-3" />
					)}
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="text-[12px] font-medium leading-tight text-white/80">
						{subtask.text}
					</span>
					{subtask.steps.length > 0 && (
						<span className="text-[10px] text-white/35">
							{subtask.steps.length} step{subtask.steps.length > 1 ? "s" : ""}
						</span>
					)}
				</div>

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/25 opacity-0 transition-all duration-150 hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100 active:scale-90"
					aria-label="Remove subtask"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>

			<AnimatePresence>
				{isExpanded && hasDetails && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-2 border-t border-white/6 px-3 pb-3 pt-2">
							{subtask.steps.length > 0 && (
								<div className="flex flex-col gap-1">
									<span className="text-[9px] font-medium uppercase tracking-wider text-white/30">
										Steps
									</span>
									<ul className="flex flex-col gap-0.5">
										{subtask.steps.map((step) => (
											<li
												key={step.text}
												className="flex items-center gap-1.5 text-[11px] text-white/50"
											>
												<span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
												{step.text}
											</li>
										))}
									</ul>
								</div>
							)}

							{subtask.notes.trim().length > 0 && (
								<div className="flex flex-col gap-1">
									<span className="text-[9px] font-medium uppercase tracking-wider text-white/30">
										Notes
									</span>
									<p className="text-[11px] leading-relaxed text-white/40">
										{subtask.notes}
									</p>
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export { TasksPluginTaskDetail };
export type { TasksPluginTaskDetailProps };
