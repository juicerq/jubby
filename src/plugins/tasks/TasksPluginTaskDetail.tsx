import { Check, Minus, Pencil, X } from "lucide-react";
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
import { usePendingDelete } from "./useTasksStorage";

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
	onNavigateBack: () => void;
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
	onNavigateBack,
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
				<TasksPluginTaskDetailSectionHeader title="Subtasks" />

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

export { TasksPluginTaskDetail };
export type { TasksPluginTaskDetailProps };
