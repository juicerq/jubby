import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tag as TagType, Task } from "../../types";
import { TagBadge, TagEditorPopover } from "../tags/tag-elements";
import { TaskProgressBadge } from "./task-progress-badge";

interface TaskListItemProps {
	task: Task;
	tags: TagType[];
	onToggle: (id: string) => void;
	onDeleteClick: (id: string) => void;
	isPendingDelete: boolean;
	isEditingTags: boolean;
	onEditTags: () => void;
	onCloseTagEditor: () => void;
	onToggleTag: (tagId: string) => void;
	onTaskClick: () => void;
}

function TaskListItem({
	task,
	tags,
	onToggle,
	onDeleteClick,
	isPendingDelete,
	isEditingTags,
	onEditTags,
	onCloseTagEditor,
	onToggleTag,
	onTaskClick,
}: TaskListItemProps) {
	const taskTags = (task.tagIds ?? [])
		.map((tagId) => tags.find((t) => t.id === tagId))
		.filter((t): t is TagType => t !== undefined);

	const hasTags = tags.length > 0;
	const hasSubtasks = task.subtasks.length > 0;
	const completedCount = task.subtasks.filter(
		(subtask) => subtask.status === "completed",
	).length;
	const totalCount = task.subtasks.length;

	return (
		<div
			role="button"
			tabIndex={0}
			className="group/task flex flex-col rounded-lg px-2 py-2.5 transition-[background] duration-150 ease-out hover:bg-white/4 cursor-pointer"
			onClick={(e) => {
				e.stopPropagation();
				onTaskClick();
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onTaskClick();
				}
			}}
		>
			<div className="flex items-center gap-3">
				<button
					type="button"
					className={cn(
						"flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] transition-all duration-150 ease-out active:scale-[0.92]",
						"active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						task.status === "completed" &&
							"border-white/90 bg-white/90 hover:border-white/75 hover:bg-white/75",
						task.status === "in_progress" &&
							"border-amber-500 bg-amber-500/20 hover:border-amber-400 hover:bg-amber-500/30",
						task.status === "pending" &&
							"border-white/25 bg-transparent hover:border-white/45 hover:bg-white/4",
					)}
					onClick={(e) => {
						e.stopPropagation();
						onToggle(task.id);
					}}
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

				<div className="flex min-w-0 flex-1 items-center gap-2">
					<span
						className={cn(
							"truncate text-[13px] font-normal leading-[1.4] tracking-[-0.01em] transition-all duration-150 ease-out",
							task.status === "completed" &&
								"text-white/35 line-through decoration-white/25",
							task.status === "in_progress" && "text-amber-200/90",
							task.status === "pending" && "text-white/90",
						)}
					>
						{task.text}
					</span>

					{hasTags && (
						<TagEditorPopover
							tags={tags}
							selectedTagIds={task.tagIds ?? []}
							onToggleTag={onToggleTag}
							open={isEditingTags}
							onOpenChange={(open) => (open ? onEditTags() : onCloseTagEditor())}
							trigger={
								<button
									type="button"
									onClick={(e) => e.stopPropagation()}
									className={cn(
										"flex shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 transition-all duration-150 ease-out active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
										isEditingTags
											? "border-white/15 bg-white/4"
											: "hover:border-white/10 hover:bg-white/4",
									)}
									aria-label="Edit tags"
								>
									{taskTags.length > 0 ? (
										taskTags.map((tag) => (
											<TagBadge
												key={tag.id}
												tag={tag}
												isCompleted={task.status === "completed"}
											/>
										))
									) : (
										<span className="text-[11px] text-white/25">+ Add tags</span>
									)}
								</button>
							}
						/>
					)}
				</div>

				{hasSubtasks && (
					<TaskProgressBadge
						completed={completedCount}
						total={totalCount}
					/>
				)}

				<button
					type="button"
					className={cn(
						"group/delete flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent transition-all duration-150 ease-out active:scale-90 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						isPendingDelete
							? "bg-red-500/20 opacity-100 hover:bg-red-500/30"
							: "opacity-0 hover:bg-red-500/15 group-hover/task:opacity-100",
					)}
					onClick={(e) => {
						e.stopPropagation();
						onDeleteClick(task.id);
					}}
					aria-label={isPendingDelete ? "Confirm delete" : "Delete task"}
				>
					{isPendingDelete ? (
						<Check className="h-3.5 w-3.5 text-red-500" />
					) : (
						<X className="h-3.5 w-3.5 text-white/40 transition-colors duration-150 ease-out group-hover/delete:text-red-500" />
					)}
				</button>
			</div>
		</div>
	);
}

export { TaskListItem };
export type { TaskListItemProps };
