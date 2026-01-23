import { Check, ChevronDown, ChevronUp, Minus, Pencil, Tag } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Tag as TagType, Task, TaskStatus } from "../../types";
import { TagBadge, TagEditorPopover } from "../tags/tag-elements";

interface TaskDetailHeaderProps {
	task: Task;
	tags: TagType[];
	onUpdateStatus: (status: TaskStatus) => Promise<void>;
	onUpdateText: (text: string) => Promise<void>;
	onToggleTag: (tagId: string) => void;
}

function TaskDetailHeader({
	task,
	tags,
	onUpdateStatus,
	onUpdateText,
	onToggleTag,
}: TaskDetailHeaderProps) {
	const {
		isEditing,
		editValue,
		setEditValue,
		inputRef,
		startEditing,
		handleKeyDown,
		handleSave,
		handleStatusClick,
	} = useTaskDetailHeaderState(task, onUpdateStatus, onUpdateText);
	const [isEditingTags, setIsEditingTags] = useState(false);
	const {
		isExpanded,
		isTruncated,
		toggleExpanded,
		descriptionRef,
	} = useCollapsibleDescription(task.description);

	const taskTags = (task.tagIds ?? [])
		.map((tagId) => tags.find((t) => t.id === tagId))
		.filter((t): t is TagType => t !== undefined);

	const hasTags = tags.length > 0;
	const hasDescription = task.description && task.description.trim().length > 0;

	return (
		<div className="flex flex-col gap-2 rounded-lg bg-white/[0.02] px-3 py-3">
			{/* Main row: checkbox, title, edit button, and tags */}
			<div className="flex items-center gap-3">
				{/* Status checkbox */}
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

				{/* Title - editable inline */}
				{isEditing ? (
					<input
						ref={inputRef}
						type="text"
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onBlur={handleSave}
						className="h-[22px] min-w-0 flex-1 bg-transparent text-[13px] font-normal leading-[1.4] tracking-[-0.01em] text-white/90 outline-none"
						autoComplete="off"
					/>
				) : (
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-[13px] font-normal leading-[1.4] tracking-[-0.01em] transition-all duration-150 ease-out",
							task.status === "completed" &&
								"text-white/35 line-through decoration-white/25",
							task.status === "in_progress" && "text-amber-200/90",
							task.status === "pending" && "text-white/90",
						)}
					>
						{task.text}
					</span>
				)}

				{/* Tags area - inline with title */}
				{hasTags && (
					<div className="relative shrink-0">
						<button
							type="button"
							onClick={() => setIsEditingTags(!isEditingTags)}
							className={cn(
								"flex cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 transition-all duration-150 ease-out active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
								isEditingTags
									? "border-white/15 bg-white/4"
									: "hover:border-white/10 hover:bg-white/4",
							)}
							aria-label="Edit tags"
						>
							{taskTags.length > 0 ? (
								<div className="flex items-center gap-1">
									{taskTags.slice(0, 3).map((tag) => (
										<TagBadge
											key={tag.id}
											tag={tag}
											isCompleted={task.status === "completed"}
										/>
									))}
									{taskTags.length > 3 && (
										<span className="text-[10px] text-white/40">
											+{taskTags.length - 3}
										</span>
									)}
								</div>
							) : (
								<span className="flex items-center gap-1 text-[11px] text-white/25">
									<Tag className="h-3 w-3" />
								</span>
							)}
						</button>

						{isEditingTags && (
							<TagEditorPopover
								tags={tags}
								selectedTagIds={task.tagIds ?? []}
								onToggleTag={onToggleTag}
								onClose={() => setIsEditingTags(false)}
							/>
						)}
					</div>
				)}

				{/* Edit button */}
				<button
					type="button"
					onClick={startEditing}
					className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/70 active:scale-90"
					aria-label="Edit task"
				>
					<Pencil className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* Description row - collapsible */}
			{hasDescription && (
				<div className="ml-[30px]">
					<button
						type="button"
						onClick={isTruncated || isExpanded ? toggleExpanded : undefined}
						className={cn(
							"group flex w-full items-start gap-1.5 rounded-md text-left transition-all duration-150 ease-out",
							(isTruncated || isExpanded) && "cursor-pointer hover:bg-white/[0.02]",
						)}
						disabled={!isTruncated && !isExpanded}
					>
						<p
							ref={descriptionRef}
							className={cn(
								"flex-1 text-[12px] leading-[1.5] text-white/50 transition-all duration-150 ease-out",
								!isExpanded && "line-clamp-2",
								task.status === "completed" && "text-white/30",
							)}
						>
							{task.description}
						</p>
						{(isTruncated || isExpanded) && (
							<span className="mt-0.5 shrink-0 text-white/30 transition-colors duration-150 group-hover:text-white/50">
								{isExpanded ? (
									<ChevronUp className="h-3.5 w-3.5" />
								) : (
									<ChevronDown className="h-3.5 w-3.5" />
								)}
							</span>
						)}
					</button>
				</div>
			)}
		</div>
	);
}

function useCollapsibleDescription(description: string | undefined) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [isTruncated, setIsTruncated] = useState(false);
	const descriptionRef = useRef<HTMLParagraphElement>(null);

	const checkTruncation = useCallback(() => {
		const element = descriptionRef.current;
		if (element) {
			// Check if text is truncated by comparing scroll height with client height
			const isTrunc = element.scrollHeight > element.clientHeight;
			setIsTruncated(isTrunc);
		}
	}, []);

	// Check truncation after render and on window resize
	useLayoutEffect(() => {
		checkTruncation();
	}, [description, checkTruncation]);

	useEffect(() => {
		const handleResize = () => checkTruncation();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [checkTruncation]);

	// Reset expanded state when description changes
	useEffect(() => {
		setIsExpanded(false);
	}, [description]);

	const toggleExpanded = useCallback(() => {
		setIsExpanded((prev) => !prev);
	}, []);

	return {
		isExpanded,
		isTruncated,
		toggleExpanded,
		descriptionRef,
	};
}

function useTaskDetailHeaderState(
	task: Task,
	onUpdateStatus: (status: TaskStatus) => Promise<void>,
	onUpdateText: (text: string) => Promise<void>,
) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(task.text);
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
			onUpdateText(trimmed);
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

	const startEditing = () => setIsEditing(true);

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
		onUpdateStatus(getNextStatus(task.status));
	};

	return {
		isEditing,
		editValue,
		setEditValue,
		inputRef,
		startEditing,
		handleKeyDown,
		handleSave,
		handleStatusClick,
	};
}

export { TaskDetailHeader };
export type { TaskDetailHeaderProps };
