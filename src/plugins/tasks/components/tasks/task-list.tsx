import type { Tag as TagType, Task } from "../../types";
import { TaskListItem } from "./task-list-item";

interface TaskListProps {
	tasks: Task[];
	tags: TagType[];
	onToggle: (id: string) => void;
	onDeleteClick: (id: string) => void;
	pendingDeleteId: string | null;
	editingTagsTaskId: string | null;
	onEditTags: (taskId: string | null) => void;
	onToggleTagOnTask: (taskId: string, tagId: string) => void;
	onTaskClick: (taskId: string) => void;
}

function TaskList({
	tasks,
	tags,
	onToggle,
	onDeleteClick,
	pendingDeleteId,
	editingTagsTaskId,
	onEditTags,
	onToggleTagOnTask,
	onTaskClick,
}: TaskListProps) {
	return (
		<>
			{tasks.map((task) => (
				<TaskListItem
					key={task.id}
					task={task}
					tags={tags}
					onToggle={onToggle}
					onDeleteClick={onDeleteClick}
					isPendingDelete={pendingDeleteId === task.id}
					isEditingTags={editingTagsTaskId === task.id}
					onEditTags={() => onEditTags(task.id)}
					onCloseTagEditor={() => onEditTags(null)}
					onToggleTag={(tagId) => onToggleTagOnTask(task.id, tagId)}
					onTaskClick={() => onTaskClick(task.id)}
				/>
			))}
		</>
	);
}

export { TaskList };
export type { TaskListProps };
