import { Check, X } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import type {
	OpencodeMode,
	SubtaskCategory,
	SubtaskStatus,
	Tag as TagType,
	Task,
	TaskStatus,
} from "../../types";
import {
	type GenerateSubtasksResult,
	usePendingDelete,
} from "../../useTasksStorage";
import { type AggregatedLog, HistoryModal } from "../modals/history-modal";
import { SubtaskInput } from "../subtasks/subtask-input";
import { SubtaskList } from "../subtasks/subtask-list";
import { SubtaskHeaderActions } from "./subtask-header-actions";
import { TaskDetailHeader } from "./task-detail-header";

interface TaskDetailActions {
	updateTaskStatus: (status: TaskStatus) => Promise<void>;
	updateTaskText: (text: string) => Promise<void>;
	updateTaskDescription: (description: string) => Promise<void>;
	setTaskTags: (tagIds: string[]) => Promise<void>;
	deleteTask: () => Promise<void>;
	createSubtask: (text: string) => Promise<void>;
	updateSubtaskStatus: (
		subtaskId: string,
		status: SubtaskStatus,
	) => Promise<void>;
	deleteSubtask: (subtaskId: string) => Promise<void>;
	reorderSubtasks: (subtaskIds: string[]) => Promise<void>;
	updateSubtaskText: (subtaskId: string, text: string) => Promise<void>;
	updateSubtaskCategory: (
		subtaskId: string,
		category: SubtaskCategory,
	) => Promise<void>;
	updateSubtaskNotes: (subtaskId: string, notes: string) => Promise<void>;
	updateSubtaskShouldCommit: (
		subtaskId: string,
		shouldCommit: boolean,
	) => Promise<void>;
	createStep: (subtaskId: string, text: string) => Promise<void>;
	toggleStep: (subtaskId: string, stepId: string) => Promise<void>;
	deleteStep: (subtaskId: string, stepId: string) => Promise<void>;
	updateStepText: (
		subtaskId: string,
		stepId: string,
		text: string,
	) => Promise<void>;
	executeSubtask: (subtaskId: string) => void;
	abortExecution: () => void;
	startLoop: () => void;
	stopLoop: () => void;
	navigateBack: () => void;
	generateSubtasks: (modelId: string) => Promise<GenerateSubtasksResult | null>;
	openOpencodeTerminal: (mode?: OpencodeMode) => Promise<void>;
}

interface TaskDetailProps {
	task: Task;
	tags: TagType[];
	actions: TaskDetailActions;
	isExecuting: boolean;
	executingSubtaskId: string | null;
	isLooping: boolean;
	isTaskGenerating: (taskId: string) => boolean;
}

function TaskDetail({
	task,
	tags,
	actions,
	isExecuting,
	executingSubtaskId,
	isLooping,
	isTaskGenerating,
}: TaskDetailProps) {
	const { historyModal, openAllHistory, openSubtaskHistory, closeHistory } =
		useTaskHistory(task);
	const { isPendingDelete, handleDelete, cancelDelete } = useTaskDeletion(
		task.id,
		actions.deleteTask,
		actions.navigateBack,
	);

	const hasAnyHistory = task.subtasks.some((s) => s.executionLogs.length > 0);
	const hasWorkingDirectory = (task.workingDirectory ?? "").trim().length > 0;

	const handleToggleTag = useCallback(
		(tagId: string) => {
			const currentTagIds = task.tagIds ?? [];
			const newTagIds = currentTagIds.includes(tagId)
				? currentTagIds.filter((id) => id !== tagId)
				: [...currentTagIds, tagId];
			actions.setTaskTags(newTagIds);
		},
		[actions, task.tagIds],
	);

	return (
		<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
			<section>
				<TaskSectionHeader
					title="Task"
					right={
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								cancelDelete();
								handleDelete();
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

				<TaskDetailHeader
					task={task}
					tags={tags}
					onUpdateStatus={actions.updateTaskStatus}
					onUpdateText={actions.updateTaskText}
					onUpdateDescription={actions.updateTaskDescription}
					onToggleTag={handleToggleTag}
				/>
			</section>

			<section className="flex flex-col">
				<TaskSectionHeader
					title="Subtasks"
					right={
						<SubtaskHeaderActions
							task={task}
							isLooping={isLooping}
							isExecuting={isExecuting}
							isGenerating={isTaskGenerating(task.id)}
							hasAnyHistory={hasAnyHistory}
							hasWorkingDirectory={hasWorkingDirectory}
							onStartLoop={actions.startLoop}
							onStopLoop={actions.stopLoop}
							onOpenHistory={openAllHistory}
							onGenerateSubtasks={actions.generateSubtasks}
							onOpenOpencodeTerminal={actions.openOpencodeTerminal}
						/>
					}
				/>

				<div className="flex flex-col gap-2">
					<SubtaskInput onCreateSubtask={actions.createSubtask} />
					<SubtaskList
						subtasks={task.subtasks}
						onUpdateSubtaskStatus={actions.updateSubtaskStatus}
						onDeleteSubtask={actions.deleteSubtask}
						onReorderSubtasks={actions.reorderSubtasks}
						onUpdateSubtaskText={actions.updateSubtaskText}
						onUpdateSubtaskCategory={actions.updateSubtaskCategory}
						onUpdateSubtaskShouldCommit={actions.updateSubtaskShouldCommit}
						onCreateStep={actions.createStep}
						onToggleStep={actions.toggleStep}
						onDeleteStep={actions.deleteStep}
						onUpdateStepText={actions.updateStepText}
						onExecuteSubtask={actions.executeSubtask}
						onAbortExecution={actions.abortExecution}
						onViewSubtaskHistory={openSubtaskHistory}
						isExecuting={isExecuting}
						executingSubtaskId={executingSubtaskId}
						hasWorkingDirectory={hasWorkingDirectory}
					/>
				</div>
			</section>

			{historyModal && (
				<HistoryModal
					logs={historyModal.logs}
					subtaskName={historyModal.subtaskName}
					onClose={closeHistory}
				/>
			)}
		</div>
	);
}

interface TaskSectionHeaderProps {
	title: string;
	right?: React.ReactNode;
}

function TaskSectionHeader({ title, right }: TaskSectionHeaderProps) {
	return (
		<div className="mb-2 flex items-center justify-between">
			<h2 className="text-[12px] font-medium tracking-wide text-white/40">
				{title}
			</h2>
			{right}
		</div>
	);
}

function useTaskDeletion(
	taskId: string,
	onDeleteTask: () => Promise<void>,
	onNavigateBack: () => void,
) {
	const { pendingId, handleDeleteClick, cancelDelete } = usePendingDelete(
		async () => {
			await onDeleteTask();
			onNavigateBack();
		},
	);

	return {
		isPendingDelete: pendingId === taskId,
		handleDelete: () => handleDeleteClick(taskId),
		cancelDelete,
	};
}

function aggregateExecutionLogs(task: Task): AggregatedLog[] {
	const aggregated: AggregatedLog[] = [];
	for (const subtask of task.subtasks) {
		for (const log of subtask.executionLogs) {
			aggregated.push({
				log,
				subtaskId: subtask.id,
				subtaskText: subtask.text,
			});
		}
	}
	return aggregated.sort((a, b) => b.log.startedAt - a.log.startedAt);
}

function useTaskHistory(task: Task) {
	const [historyModal, setHistoryModal] = useState<{
		logs: AggregatedLog[];
		subtaskName?: string;
	} | null>(null);

	const openAllHistory = () => {
		setHistoryModal({ logs: aggregateExecutionLogs(task) });
	};

	const openSubtaskHistory = (subtaskId: string, subtaskText: string) => {
		const subtask = task.subtasks.find((s) => s.id === subtaskId);
		if (!subtask) return;
		const logs: AggregatedLog[] = subtask.executionLogs.map((log) => ({
			log,
			subtaskId,
			subtaskText,
		}));
		setHistoryModal({ logs, subtaskName: subtaskText });
	};

	const closeHistory = () => setHistoryModal(null);

	return { historyModal, openAllHistory, openSubtaskHistory, closeHistory };
}

export { TaskDetail };
export type { TaskDetailActions, TaskDetailProps };
