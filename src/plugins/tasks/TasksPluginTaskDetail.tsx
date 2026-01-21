import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TasksPluginSubtaskInput, TasksPluginSubtaskList } from "./TasksPlugin";
import type { Tag as TagType, Task, TaskStatus } from "./types";
import { usePendingDelete } from "./useTasksStorage";

interface TasksPluginTaskDetailProps {
	task: Task;
	tags: TagType[];
	onDeleteTask: (id: string) => Promise<void>;
	onUpdateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
	onUpdateTaskText: (id: string, text: string) => Promise<void>;
	onSetTaskTags: (taskId: string, tagIds: string[]) => Promise<void>;
	onCreateSubtask: (taskId: string, text: string) => Promise<void>;
	onToggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	onDeleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	onReorderSubtasks: (taskId: string, subtaskIds: string[]) => Promise<void>;
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
	onToggleSubtask,
	onDeleteSubtask,
	onReorderSubtasks,
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

	void tags;
	void onUpdateTaskStatus;
	void onUpdateTaskText;
	void handleToggleTag;

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

				<TasksPluginTaskInfoPlaceholder />
			</section>

			<section className="flex flex-1 flex-col overflow-hidden">
				<TasksPluginTaskDetailSectionHeader title="Subtasks" />

				<div className="flex flex-1 flex-col gap-2 overflow-y-auto">
					<TasksPluginSubtaskInput
						onCreateSubtask={(text) => onCreateSubtask(task.id, text)}
					/>
					<TasksPluginSubtaskList
						subtasks={task.subtasks}
						onToggleSubtask={(subtaskId) => onToggleSubtask(task.id, subtaskId)}
						onDeleteSubtask={(subtaskId) => onDeleteSubtask(task.id, subtaskId)}
						onReorderSubtasks={(subtaskIds) =>
							onReorderSubtasks(task.id, subtaskIds)
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

function TasksPluginTaskInfoPlaceholder() {
	return (
		<div className="flex items-center justify-center rounded-lg border border-dashed border-white/10 py-6">
			<span className="text-[12px] text-white/30">Task info - Task 6</span>
		</div>
	);
}

export { TasksPluginTaskDetail };
export type { TasksPluginTaskDetailProps };
