import {
	Check,
	ChevronDown,
	ChevronRight,
	FolderOpen,
	GripVertical,
	Minus,
	Pencil,
	Plus,
	Settings,
	Tag,
	Trash2,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Breadcrumb } from "@/core/components/Breadcrumb";
import { useNavigationLevels } from "@/core/hooks";
import type { PluginProps } from "@/core/types";
import { cn } from "@/lib/utils";
import type {
	Folder,
	RecentTask,
	Subtask,
	Tag as TagType,
	Task,
	TaskStatus,
} from "./types";
import {
	useFolderStorage,
	usePendingDelete,
	useTasksStorage,
} from "./useTasksStorage";

const TAG_COLORS = [
	{ name: "Red", hex: "#ef4444", contrastText: "white" },
	{ name: "Orange", hex: "#f97316", contrastText: "white" },
	{ name: "Yellow", hex: "#eab308", contrastText: "#0a0a0a" },
	{ name: "Green", hex: "#22c55e", contrastText: "white" },
	{ name: "Blue", hex: "#3b82f6", contrastText: "white" },
	{ name: "Purple", hex: "#8b5cf6", contrastText: "white" },
	{ name: "Pink", hex: "#ec4899", contrastText: "white" },
	{ name: "Gray", hex: "#6b7280", contrastText: "white" },
] as const;

type TasksView = "folders" | "list" | "task";

function TasksPlugin(_props: PluginProps) {
	// Folder management
	const {
		folders,
		isLoading: foldersLoading,
		createFolder,
		renameFolder,
		deleteFolder,
		loadFolders,
		reorderFolders,
	} = useFolderStorage();

	// Current folder state (null means we're on the folder list view)
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
	const [view, setView] = useState<TasksView>("folders");

	// Current task state (null means we're not viewing a specific task)
	const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

	// Get current folder details
	const currentFolder = currentFolderId
		? (folders.find((f) => f.id === currentFolderId) ?? null)
		: null;

	// Tasks storage - only loads when we have a folder selected
	const {
		tasks,
		tags,
		isLoading: tasksLoading,
		createTask,
		updateTaskStatus,
		deleteTask,
		setTaskTags,
		createTag,
		updateTag,
		deleteTag,
		createSubtask,
		toggleSubtask,
		deleteSubtask,
		reorderSubtasks,
	} = useTasksStorage(currentFolderId ?? "");

	const isLoading =
		view === "folders" ? foldersLoading : foldersLoading || tasksLoading;

	const currentTask = currentTaskId
		? (tasks.find((t) => t.id === currentTaskId) ?? null)
		: null;

	// Declarative navigation: levels derived from state
	useNavigationLevels([
		{
			id: "tasks",
			label: "Tasks",
			onNavigate: () => {
				setCurrentFolderId(null);
				setCurrentTaskId(null);
				setView("folders");
				loadFolders();
			},
		},
		currentFolder && {
			id: `folder-${currentFolderId}`,
			label: currentFolder.name,
			onNavigate: () => {
				setCurrentTaskId(null);
				setView("list");
			},
		},
		currentTask && {
			id: `task-${currentTaskId}`,
			label:
				currentTask.text.length > 20
					? `${currentTask.text.slice(0, 20)}...`
					: currentTask.text,
		},
	]);

	const [newTaskText, setNewTaskText] = useState("");
	const {
		pendingId: pendingDeleteId,
		handleDeleteClick,
		cancelDelete: handleCancelDelete,
	} = usePendingDelete(deleteTask);
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const [editingTagsTaskId, setEditingTagsTaskId] = useState<string | null>(
		null,
	);

	// Clean up selectedTagIds when tags are deleted
	useEffect(() => {
		const validTagIds = new Set(tags.map((t) => t.id));
		setSelectedTagIds((prev) => {
			const filtered = prev.filter((id) => validTagIds.has(id));
			return filtered.length === prev.length ? prev : filtered;
		});
	}, [tags]);

	// Folder creation state
	const [isCreatingFolder, setIsCreatingFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	// Folder settings menu state
	const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
	const [isRenamingFolder, setIsRenamingFolder] = useState(false);
	const [renameFolderValue, setRenameFolderValue] = useState("");
	const [isDeletingFolder, setIsDeletingFolder] = useState(false);

	// Manage tags modal state
	const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);

	// Navigation handlers
	const handleNavigateToFolder = (folderId: string) => {
		setCurrentFolderId(folderId);
		setView("list");
		setSelectedTagIds([]);
	};

	const handleNavigateToFolders = () => {
		setCurrentFolderId(null);
		setView("folders");
		loadFolders();
	};

	const handleNavigateToTask = (taskId: string) => {
		setCurrentTaskId(taskId);
		setView("task");
	};

	const handleNavigateToList = () => {
		setCurrentTaskId(null);
		setView("list");
	};

	void handleNavigateToTask;
	void handleNavigateToList;

	const handleCreateFolder = async () => {
		if (!newFolderName.trim()) return;
		await createFolder(newFolderName.trim());
		setNewFolderName("");
		setIsCreatingFolder(false);
	};

	const handleFolderInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleCreateFolder();
		} else if (e.key === "Escape") {
			setIsCreatingFolder(false);
			setNewFolderName("");
		}
	};

	const handleStartRenameFolder = () => {
		setRenameFolderValue(currentFolder?.name ?? "");
		setIsRenamingFolder(true);
		setIsSettingsMenuOpen(false);
	};

	const handleRenameFolder = async () => {
		if (!currentFolderId || !renameFolderValue.trim()) return;
		await renameFolder(currentFolderId, renameFolderValue.trim());
		setIsRenamingFolder(false);
		setRenameFolderValue("");
	};

	const handleRenameFolderKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleRenameFolder();
		} else if (e.key === "Escape") {
			setIsRenamingFolder(false);
			setRenameFolderValue("");
		}
	};

	const handleStartDeleteFolder = () => {
		setIsDeletingFolder(true);
		setIsSettingsMenuOpen(false);
	};

	const handleConfirmDeleteFolder = async () => {
		if (!currentFolderId) return;
		const success = await deleteFolder(currentFolderId);
		if (success) {
			setIsDeletingFolder(false);
			handleNavigateToFolders();
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && newTaskText.trim()) {
			createTask(
				newTaskText.trim(),
				selectedTagIds.length > 0 ? selectedTagIds : undefined,
			);
			setNewTaskText("");
		}
	};

	const handleToggleTagSelection = (tagId: string) => {
		setSelectedTagIds((prev) =>
			prev.includes(tagId)
				? prev.filter((id) => id !== tagId)
				: [...prev, tagId],
		);
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

	const handleToggle = (id: string) => {
		const task = tasks.find((t) => t.id === id);
		if (task) {
			updateTaskStatus(id, getNextStatus(task.status));
		}
	};

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<span className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
			</div>
		);
	}

	const sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);

	const filteredTasks =
		selectedTagIds.length === 0
			? sortedTasks
			: sortedTasks.filter((task) =>
					selectedTagIds.every((tagId) => task.tagIds?.includes(tagId)),
				);

	const handleToggleTagOnTask = (taskId: string, tagId: string) => {
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return;

		const currentTagIds = task.tagIds ?? [];
		const newTagIds = currentTagIds.includes(tagId)
			? currentTagIds.filter((id) => id !== tagId)
			: [...currentTagIds, tagId];

		setTaskTags(taskId, newTagIds);
	};

	// Build the header right content for folders view (+ button)
	const folderAddButton =
		view === "folders" ? (
			<button
				type="button"
				onClick={() => setIsCreatingFolder(true)}
				className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
				aria-label="Create folder"
			>
				<Plus size={16} />
			</button>
		) : undefined;

	// Build the header right content for list view (settings button)
	const folderSettingsButton =
		view === "list" ? (
			<div className="relative">
				<button
					type="button"
					onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						isSettingsMenuOpen && "bg-white/6 text-white/90",
					)}
					aria-label="Folder settings"
				>
					<Settings size={16} />
				</button>
				{isSettingsMenuOpen && (
					<TasksPluginFolderSettingsMenu
						onRename={handleStartRenameFolder}
						onDelete={handleStartDeleteFolder}
						onClose={() => setIsSettingsMenuOpen(false)}
						taskCount={currentFolder?.taskCount ?? 0}
						tagCount={tags.length}
					/>
				)}
			</div>
		) : undefined;

	// Folders view
	if (view === "folders") {
		return (
			<div className="flex h-full flex-col overflow-hidden">
				<Breadcrumb right={folderAddButton} />
				<div className="flex flex-1 flex-col overflow-hidden p-4">
					{isCreatingFolder && (
						<TasksPluginFolderInput
							value={newFolderName}
							onChange={setNewFolderName}
							onKeyDown={handleFolderInputKeyDown}
							onBlur={() => {
								if (!newFolderName.trim()) {
									setIsCreatingFolder(false);
								}
							}}
						/>
					)}
					{folders.length === 0 && !isCreatingFolder ? (
						<TasksPluginFoldersEmptyState
							onCreate={() => setIsCreatingFolder(true)}
						/>
					) : (
						<TasksPluginFolderList
							folders={folders}
							onFolderClick={handleNavigateToFolder}
							onReorder={reorderFolders}
						/>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<Breadcrumb right={folderSettingsButton} />
			<div
				className="flex flex-1 flex-col gap-3 overflow-hidden p-4"
				onClick={() => {
					handleCancelDelete();
					setEditingTagsTaskId(null);
					setIsSettingsMenuOpen(false);
				}}
			>
				<TasksPluginInputArea
					value={newTaskText}
					onChange={setNewTaskText}
					onKeyDown={handleKeyDown}
					onTagsClick={() => setIsManageTagsOpen(true)}
					tags={tags}
					selectedTagIds={selectedTagIds}
					onToggleTag={handleToggleTagSelection}
				/>
				<h2 className="text-[12px] font-medium text-white/40 uppercase tracking-wide">
					Tasks
				</h2>
				{filteredTasks.length === 0 ? (
					<TasksPluginEmptyState hasFilter={selectedTagIds.length > 0} />
				) : (
					<TasksPluginList
						tasks={filteredTasks}
						tags={tags}
						onToggle={handleToggle}
						onDeleteClick={handleDeleteClick}
						pendingDeleteId={pendingDeleteId}
						editingTagsTaskId={editingTagsTaskId}
						onEditTags={setEditingTagsTaskId}
						onToggleTagOnTask={handleToggleTagOnTask}
						onCreateSubtask={createSubtask}
						onToggleSubtask={toggleSubtask}
						onDeleteSubtask={deleteSubtask}
						onReorderSubtasks={reorderSubtasks}
					/>
				)}
			</div>

			{isRenamingFolder && (
				<TasksPluginRenameFolderModal
					value={renameFolderValue}
					onChange={setRenameFolderValue}
					onSubmit={handleRenameFolder}
					onKeyDown={handleRenameFolderKeyDown}
					onClose={() => {
						setIsRenamingFolder(false);
						setRenameFolderValue("");
					}}
				/>
			)}

			{isDeletingFolder && currentFolder && (
				<TasksPluginDeleteFolderModal
					folderName={currentFolder.name}
					taskCount={currentFolder.taskCount}
					tagCount={tags.length}
					onConfirm={handleConfirmDeleteFolder}
					onClose={() => setIsDeletingFolder(false)}
				/>
			)}

			{isManageTagsOpen && (
				<TasksPluginManageTagsModal
					tags={tags}
					onCreateTag={createTag}
					onUpdateTag={updateTag}
					onDeleteTag={deleteTag}
					onClose={() => setIsManageTagsOpen(false)}
				/>
			)}
		</div>
	);
}

interface TasksPluginInputAreaProps {
	value: string;
	onChange: (value: string) => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
	onTagsClick: () => void;
	tags: TagType[];
	selectedTagIds: string[];
	onToggleTag: (tagId: string) => void;
}

function TasksPluginInputArea({
	value,
	onChange,
	onKeyDown,
	onTagsClick,
	tags,
	selectedTagIds,
	onToggleTag,
}: TasksPluginInputAreaProps) {
	return (
		<div className="flex shrink-0 flex-col gap-2">
			<div className="flex gap-2">
				<div className="relative flex-1">
					<input
						type="text"
						placeholder="What needs to be done?"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						onKeyDown={onKeyDown}
						onClick={(e) => e.stopPropagation()}
						className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 pr-9 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						autoComplete="off"
					/>
					<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/25 opacity-0 transition-opacity duration-180ms ease-out peer-focus:opacity-100 [input:focus+&]:opacity-100 [input:not(:placeholder-shown)+&]:opacity-100">
						↵
					</span>
				</div>
				<TasksPluginTagButton onClick={onTagsClick} />
			</div>
			{tags.length > 0 && (
				<TasksPluginTagSelector
					tags={tags}
					selectedTagIds={selectedTagIds}
					onToggleTag={onToggleTag}
				/>
			)}
		</div>
	);
}

function TasksPluginTagButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			className="group flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-transparent bg-white/4 transition-all duration-180ms ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
			aria-label="Manage tags"
			title="Manage tags"
		>
			<Tag className="h-4 w-4 text-white/40 transition-colors duration-180ms ease-out group-hover:text-white/70" />
		</button>
	);
}

interface TasksPluginTagSelectorProps {
	tags: TagType[];
	selectedTagIds: string[];
	onToggleTag: (tagId: string) => void;
}

function TasksPluginTagSelector({
	tags,
	selectedTagIds,
	onToggleTag,
}: TasksPluginTagSelectorProps) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{tags.map((tag) => {
				const isSelected = selectedTagIds.includes(tag.id);

				return (
					<button
						key={tag.id}
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggleTag(tag.id);
						}}
						className="inline-flex cursor-pointer items-center rounded px-2 py-1 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						style={{
							backgroundColor: `${tag.color}${isSelected ? "50" : "20"}`,
							color: tag.color,
						}}
						title={
							isSelected ? `Remove ${tag.name} filter` : `Filter by ${tag.name}`
						}
					>
						{tag.name}
					</button>
				);
			})}
		</div>
	);
}

function TasksPluginEmptyState({ hasFilter = false }: { hasFilter?: boolean }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
			<div className="text-[28px] leading-none opacity-60">○</div>
			<p className="text-[13px] font-normal tracking-[-0.01em]">
				{hasFilter ? "No tasks match the filter" : "No tasks yet"}
			</p>
		</div>
	);
}

interface TasksPluginListProps {
	tasks: Task[];
	tags: TagType[];
	onToggle: (id: string) => void;
	onDeleteClick: (id: string) => void;
	pendingDeleteId: string | null;
	editingTagsTaskId: string | null;
	onEditTags: (taskId: string | null) => void;
	onToggleTagOnTask: (taskId: string, tagId: string) => void;
	onCreateSubtask: (taskId: string, text: string) => Promise<void>;
	onToggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	onDeleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	onReorderSubtasks: (taskId: string, subtaskIds: string[]) => Promise<void>;
}

function TasksPluginList({
	tasks,
	tags,
	onToggle,
	onDeleteClick,
	pendingDeleteId,
	editingTagsTaskId,
	onEditTags,
	onToggleTagOnTask,
	onCreateSubtask,
	onToggleSubtask,
	onDeleteSubtask,
	onReorderSubtasks,
}: TasksPluginListProps) {
	return (
		<div className="-mx-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
			{tasks.map((task) => (
				<TasksPluginItem
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
					onCreateSubtask={(text) => onCreateSubtask(task.id, text)}
					onToggleSubtask={(subtaskId) => onToggleSubtask(task.id, subtaskId)}
					onDeleteSubtask={(subtaskId) => onDeleteSubtask(task.id, subtaskId)}
					onReorderSubtasks={(subtaskIds) =>
						onReorderSubtasks(task.id, subtaskIds)
					}
				/>
			))}
		</div>
	);
}

interface TasksPluginItemProps {
	task: Task;
	tags: TagType[];
	onToggle: (id: string) => void;
	onDeleteClick: (id: string) => void;
	isPendingDelete: boolean;
	isEditingTags: boolean;
	onEditTags: () => void;
	onCloseTagEditor: () => void;
	onToggleTag: (tagId: string) => void;
	onCreateSubtask: (text: string) => void;
	onToggleSubtask: (subtaskId: string) => void;
	onDeleteSubtask: (subtaskId: string) => void;
	onReorderSubtasks: (subtaskIds: string[]) => void;
}

function TasksPluginItem({
	task,
	tags,
	onToggle,
	onDeleteClick,
	isPendingDelete,
	isEditingTags,
	onEditTags,
	onCloseTagEditor,
	onToggleTag,
	onCreateSubtask,
	onToggleSubtask,
	onDeleteSubtask,
	onReorderSubtasks,
}: TasksPluginItemProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const taskTags = (task.tagIds ?? [])
		.map((tagId) => tags.find((t) => t.id === tagId))
		.filter((t): t is TagType => t !== undefined);

	const hasTags = tags.length > 0;
	const hasSubtasks = task.subtasks.length > 0;
	const sortedSubtasks = [...task.subtasks].sort(
		(a, b) => a.position - b.position,
	);
	const completedCount = task.subtasks.filter((s) => s.completed).length;
	const totalCount = task.subtasks.length;

	return (
		<div
			className="group/task flex flex-col rounded-lg px-2 py-2.5 transition-[background] duration-150 ease-out hover:bg-white/4"
			onClick={(e) => e.stopPropagation()}
		>
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
					onClick={() => onToggle(task.id)}
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

				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="flex items-center gap-2">
						<span
							className={cn(
								"flex-1 text-[13px] font-normal leading-[1.4] tracking-[-0.01em] transition-all duration-150 ease-out",
								task.status === "completed" &&
									"text-white/35 line-through decoration-white/25",
								task.status === "in_progress" && "text-amber-200/90",
								task.status === "pending" && "text-white/90",
							)}
						>
							{task.text}
						</span>

						{hasSubtasks && (
							<TasksPluginProgressBadge
								completed={completedCount}
								total={totalCount}
							/>
						)}
					</div>

					{hasTags && (
						<div className="relative">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									if (isEditingTags) {
										onCloseTagEditor();
									} else {
										onEditTags();
									}
								}}
								className={`flex flex-wrap items-center gap-1 rounded-md border border-transparent p-0.5 -m-0.5 transition-all duration-150 ease-out active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] ${
									isEditingTags
										? "border-white/15 bg-white/4"
										: "hover:border-white/10 hover:bg-white/4"
								}`}
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
									<span className="px-1 text-[11px] text-white/25">
										+ Add tags
									</span>
								)}
							</button>

							{isEditingTags && (
								<TasksPluginTagEditorPopover
									tags={tags}
									selectedTagIds={task.tagIds ?? []}
									onToggleTag={onToggleTag}
									onClose={onCloseTagEditor}
								/>
							)}
						</div>
					)}
				</div>

				<button
					type="button"
					className={cn(
						"mt-0.5 group/delete flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent transition-all duration-150 ease-out active:scale-90 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						isPendingDelete
							? "bg-red-500/20 opacity-100 hover:bg-red-500/30"
							: "opacity-0 hover:bg-red-500/15 group-hover/task:opacity-100",
					)}
					onClick={() => onDeleteClick(task.id)}
					aria-label={isPendingDelete ? "Confirm delete" : "Delete task"}
				>
					{isPendingDelete ? (
						<Check className="h-3.5 w-3.5 text-red-500" />
					) : (
						<X className="h-3.5 w-3.5 text-white/40 transition-colors duration-150 ease-out group-hover/delete:text-red-500" />
					)}
				</button>
			</div>

			<TasksPluginSubtaskSection
				subtasks={sortedSubtasks}
				isExpanded={isExpanded}
				onToggleExpand={() => setIsExpanded(!isExpanded)}
				onCreateSubtask={onCreateSubtask}
				onToggleSubtask={onToggleSubtask}
				onDeleteSubtask={onDeleteSubtask}
				onReorderSubtasks={onReorderSubtasks}
			/>
		</div>
	);
}

// --- Subtask Components ---

interface TasksPluginProgressBadgeProps {
	completed: number;
	total: number;
}

function TasksPluginProgressBadge({
	completed,
	total,
}: TasksPluginProgressBadgeProps) {
	const isAllComplete = completed === total && total > 0;

	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-tight transition-all duration-150 ease-out",
				isAllComplete
					? "bg-emerald-500/15 text-emerald-400"
					: "bg-white/6 text-white/45",
			)}
		>
			<Check
				className={cn(
					"h-2.5 w-2.5",
					isAllComplete ? "text-emerald-400" : "text-white/35",
				)}
			/>
			{completed}/{total}
		</span>
	);
}

interface TasksPluginSubtaskSectionProps {
	subtasks: Subtask[];
	isExpanded: boolean;
	onToggleExpand: () => void;
	onCreateSubtask: (text: string) => void;
	onToggleSubtask: (subtaskId: string) => void;
	onDeleteSubtask: (subtaskId: string) => void;
	onReorderSubtasks: (subtaskIds: string[]) => void;
}

function TasksPluginSubtaskSection({
	subtasks,
	isExpanded,
	onToggleExpand,
	onCreateSubtask,
	onToggleSubtask,
	onDeleteSubtask,
	onReorderSubtasks,
}: TasksPluginSubtaskSectionProps) {
	const hasSubtasks = subtasks.length > 0;

	return (
		<div className="ml-[30px] mt-1">
			<button
				type="button"
				onClick={onToggleExpand}
				className="flex items-center gap-1 rounded py-1 text-[11px] text-white/40 transition-all duration-150 ease-out hover:text-white/60"
			>
				{isExpanded ? (
					<ChevronDown className="h-3 w-3" />
				) : (
					<ChevronRight className="h-3 w-3" />
				)}
				<span>
					{hasSubtasks
						? `${subtasks.length} subtask${subtasks.length !== 1 ? "s" : ""}`
						: "Add subtasks"}
				</span>
			</button>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-0.5 pt-1">
							{hasSubtasks && (
								<TasksPluginSubtaskList
									subtasks={subtasks}
									onToggleSubtask={onToggleSubtask}
									onDeleteSubtask={onDeleteSubtask}
									onReorderSubtasks={onReorderSubtasks}
								/>
							)}
							<TasksPluginSubtaskInput onCreateSubtask={onCreateSubtask} />
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface TasksPluginSubtaskListProps {
	subtasks: Subtask[];
	onToggleSubtask: (subtaskId: string) => void;
	onDeleteSubtask: (subtaskId: string) => void;
	onReorderSubtasks: (subtaskIds: string[]) => void;
}

function TasksPluginSubtaskList({
	subtasks,
	onToggleSubtask,
	onDeleteSubtask,
	onReorderSubtasks,
}: TasksPluginSubtaskListProps) {
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(
		null,
	);
	const [isActiveDrag, setIsActiveDrag] = useState(false);
	const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const dragStartPos = useRef<{ x: number; y: number } | null>(null);
	const isDraggingRef = useRef(false);
	const originalPositions = useRef<
		Map<string, { top: number; bottom: number; midY: number }>
	>(new Map());
	const lastDropTarget = useRef<{
		id: string;
		position: "above" | "below";
	} | null>(null);

	const draggedSubtask = useMemo(() => {
		if (!draggedId) return null;
		return subtasks.find((s) => s.id === draggedId) ?? null;
	}, [subtasks, draggedId]);

	const ghostInsertIndex = useMemo(() => {
		if (!isActiveDrag || !draggedId || !dragOverId || !dropPosition) return -1;

		const draggedIndex = subtasks.findIndex((s) => s.id === draggedId);
		const targetIndex = subtasks.findIndex((s) => s.id === dragOverId);
		if (draggedIndex === -1 || targetIndex === -1) return -1;

		const insertIndex =
			dropPosition === "above" ? targetIndex : targetIndex + 1;

		if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
			return -1;
		}

		return insertIndex;
	}, [subtasks, isActiveDrag, draggedId, dragOverId, dropPosition]);

	const handleMouseDown = (e: React.MouseEvent, subtaskId: string) => {
		if (e.button !== 0) return;
		dragStartPos.current = { x: e.clientX, y: e.clientY };
		setDraggedId(subtaskId);
	};

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!draggedId || !dragStartPos.current) return;

			const dx = e.clientX - dragStartPos.current.x;
			const dy = e.clientY - dragStartPos.current.y;
			if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) < 5) return;

			if (!isDraggingRef.current) {
				isDraggingRef.current = true;
				setIsActiveDrag(true);
				document.body.classList.add("dragging-subtask");

				originalPositions.current.clear();
				for (const [subtaskId, itemEl] of itemRefs.current.entries()) {
					const rect = itemEl.getBoundingClientRect();
					originalPositions.current.set(subtaskId, {
						top: rect.top,
						bottom: rect.bottom,
						midY: rect.top + rect.height / 2,
					});
				}
			}

			let foundTarget = false;
			const cursorY = e.clientY;

			const sortedItems = Array.from(originalPositions.current.entries())
				.filter(([id]) => id !== draggedId)
				.sort((a, b) => a[1].top - b[1].top);

			const hysteresis = lastDropTarget.current ? 8 : 0;

			for (let i = 0; i < sortedItems.length; i++) {
				const [subtaskId, pos] = sortedItems[i];
				const isCurrentTarget = lastDropTarget.current?.id === subtaskId;

				const prevItem = i > 0 ? sortedItems[i - 1][1] : null;
				const nextItem =
					i < sortedItems.length - 1 ? sortedItems[i + 1][1] : null;

				const aboveZoneTop = prevItem ? prevItem.midY : pos.top - 50;
				const aboveZoneBottom = pos.midY;
				const belowZoneTop = pos.midY;
				const belowZoneBottom = nextItem ? nextItem.midY : pos.bottom + 50;

				const aboveTopThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "above"
						? aboveZoneTop - hysteresis
						: aboveZoneTop;
				const belowBottomThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "below"
						? belowZoneBottom + hysteresis
						: belowZoneBottom;

				if (cursorY >= aboveTopThreshold && cursorY < aboveZoneBottom) {
					if (dragOverId !== subtaskId || dropPosition !== "above") {
						setDragOverId(subtaskId);
						setDropPosition("above");
						lastDropTarget.current = { id: subtaskId, position: "above" };
					}
					foundTarget = true;
					break;
				}

				if (cursorY >= belowZoneTop && cursorY <= belowBottomThreshold) {
					if (dragOverId !== subtaskId || dropPosition !== "below") {
						setDragOverId(subtaskId);
						setDropPosition("below");
						lastDropTarget.current = { id: subtaskId, position: "below" };
					}
					foundTarget = true;
					break;
				}
			}

			if (!foundTarget) {
				setDragOverId(null);
				setDropPosition(null);
				lastDropTarget.current = null;
			}
		},
		[draggedId, dragOverId, dropPosition],
	);

	const handleMouseUp = useCallback(() => {
		if (draggedId && isDraggingRef.current && dragOverId && dropPosition) {
			const newOrder = [...subtasks];
			const draggedIndex = newOrder.findIndex((s) => s.id === draggedId);
			const targetIndex = newOrder.findIndex((s) => s.id === dragOverId);

			if (draggedIndex !== -1 && targetIndex !== -1) {
				const [draggedItem] = newOrder.splice(draggedIndex, 1);

				let insertIndex = targetIndex;
				if (dropPosition === "below") {
					insertIndex =
						draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
				} else {
					insertIndex =
						draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
				}

				newOrder.splice(insertIndex, 0, draggedItem);
				onReorderSubtasks(newOrder.map((s) => s.id));
			}
		}

		setDraggedId(null);
		setDragOverId(null);
		setDropPosition(null);
		setIsActiveDrag(false);
		dragStartPos.current = null;
		isDraggingRef.current = false;
		originalPositions.current.clear();
		lastDropTarget.current = null;
		document.body.classList.remove("dragging-subtask");
		window.getSelection()?.removeAllRanges();
	}, [draggedId, dragOverId, dropPosition, subtasks, onReorderSubtasks]);

	useEffect(() => {
		if (draggedId) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			return () => {
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};
		}
	}, [draggedId, handleMouseMove, handleMouseUp]);

	const setItemRef = useCallback(
		(subtaskId: string, el: HTMLDivElement | null) => {
			if (el) {
				itemRefs.current.set(subtaskId, el);
			} else {
				itemRefs.current.delete(subtaskId);
			}
		},
		[],
	);

	const renderItems = useMemo(() => {
		const items: Array<{
			type: "subtask" | "ghost";
			subtask: Subtask;
			key: string;
		}> = [];

		subtasks.forEach((subtask, index) => {
			if (ghostInsertIndex === index && draggedSubtask) {
				items.push({ type: "ghost", subtask: draggedSubtask, key: "ghost" });
			}

			items.push({ type: "subtask", subtask, key: subtask.id });
		});

		if (ghostInsertIndex === subtasks.length && draggedSubtask) {
			items.push({ type: "ghost", subtask: draggedSubtask, key: "ghost" });
		}

		return items;
	}, [subtasks, ghostInsertIndex, draggedSubtask]);

	return (
		<div className="flex flex-col">
			<AnimatePresence mode="popLayout">
				{renderItems.map((item) => {
					if (item.type === "ghost") {
						return (
							<motion.div
								key="ghost"
								initial={{ opacity: 0, scale: 0.95, height: 0 }}
								animate={{ opacity: 1, scale: 1, height: "auto" }}
								exit={{ opacity: 0, scale: 0.95, height: 0 }}
								transition={{ duration: 0.15, ease: "easeOut" }}
							>
								<TasksPluginSubtaskGhost subtask={item.subtask} />
							</motion.div>
						);
					}

					return (
						<motion.div
							key={item.key}
							layout
							layoutId={item.subtask.id}
							transition={{
								layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
							}}
						>
							<TasksPluginSubtaskItem
								subtask={item.subtask}
								onToggle={() => onToggleSubtask(item.subtask.id)}
								onDelete={() => onDeleteSubtask(item.subtask.id)}
								isDragging={
									draggedId === item.subtask.id && isDraggingRef.current
								}
								isAnyDragging={isActiveDrag}
								onMouseDown={(e) => handleMouseDown(e, item.subtask.id)}
								itemRef={(el) => setItemRef(item.subtask.id, el)}
							/>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
}

interface TasksPluginSubtaskItemProps {
	subtask: Subtask;
	onToggle: () => void;
	onDelete: () => void;
	isDragging?: boolean;
	isAnyDragging?: boolean;
	onMouseDown?: (e: React.MouseEvent) => void;
	itemRef?: (el: HTMLDivElement | null) => void;
}

function TasksPluginSubtaskItem({
	subtask,
	onToggle,
	onDelete,
	isDragging = false,
	isAnyDragging = false,
	onMouseDown,
	itemRef,
}: TasksPluginSubtaskItemProps) {
	return (
		<div
			ref={itemRef}
			className={cn(
				"group/subtask flex items-center gap-2 rounded py-1 pr-1 transition-all duration-150 ease-out",
				isDragging && "opacity-40 scale-[0.98] pointer-events-none",
			)}
		>
			<div
				onMouseDown={onMouseDown}
				className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center"
			>
				<GripVertical className="h-3 w-3 text-white/15 transition-colors duration-150 group-hover/subtask:text-white/30" />
			</div>

			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded border transition-all duration-150 ease-out active:scale-[0.9]",
					subtask.completed
						? "border-white/50 bg-white/50"
						: "border-white/25 bg-transparent hover:border-white/40",
				)}
				aria-label={subtask.completed ? "Mark incomplete" : "Mark complete"}
			>
				{subtask.completed && <Check className="h-2 w-2 text-[#0a0a0a]" />}
			</button>

			<span
				className={cn(
					"flex-1 text-[12px] leading-tight tracking-[-0.01em] transition-all duration-150 ease-out",
					subtask.completed
						? "text-white/30 line-through decoration-white/20"
						: "text-white/70",
					isAnyDragging && "select-none",
				)}
			>
				{subtask.text}
			</span>

			<button
				type="button"
				onClick={onDelete}
				className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-150 ease-out hover:bg-red-500/15 group-hover/subtask:opacity-100 active:scale-90"
				aria-label="Delete subtask"
			>
				<X className="h-3 w-3 text-white/30 transition-colors duration-150 hover:text-red-400" />
			</button>
		</div>
	);
}

interface TasksPluginSubtaskGhostProps {
	subtask: Subtask;
}

function TasksPluginSubtaskGhost({ subtask }: TasksPluginSubtaskGhostProps) {
	return (
		<div className="flex items-center gap-2 rounded border border-dashed border-white/20 bg-white/[0.03] py-1 pr-1">
			<div className="flex h-5 w-4 shrink-0 items-center justify-center">
				<GripVertical className="h-3 w-3 text-white/20" />
			</div>

			<div
				className={cn(
					"flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
					subtask.completed
						? "border-white/30 bg-white/30"
						: "border-white/15 bg-transparent",
				)}
			>
				{subtask.completed && <Check className="h-2 w-2 text-[#0a0a0a]/50" />}
			</div>

			<span className="flex-1 select-none text-[12px] leading-tight tracking-[-0.01em] text-white/40">
				{subtask.text}
			</span>
		</div>
	);
}

interface TasksPluginSubtaskInputProps {
	onCreateSubtask: (text: string) => void;
}

function TasksPluginSubtaskInput({
	onCreateSubtask,
}: TasksPluginSubtaskInputProps) {
	const [value, setValue] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = () => {
		if (!value.trim()) return;
		onCreateSubtask(value.trim());
		setValue("");
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		} else if (e.key === "Escape") {
			setValue("");
			inputRef.current?.blur();
		}
	};

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded py-1 transition-all duration-150 ease-out",
				isFocused && "bg-white/[0.02]",
			)}
		>
			<div className="flex h-5 w-4 shrink-0 items-center justify-center">
				<Plus
					className={cn(
						"h-3 w-3 transition-colors duration-150",
						isFocused ? "text-white/40" : "text-white/20",
					)}
				/>
			</div>

			<input
				ref={inputRef}
				type="text"
				placeholder="Add subtask..."
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onFocus={() => setIsFocused(true)}
				onBlur={() => {
					setIsFocused(false);
					if (value.trim()) {
						handleSubmit();
					}
				}}
				className="h-5 flex-1 bg-transparent text-[12px] leading-tight tracking-[-0.01em] text-white/70 outline-none placeholder:text-white/25"
				autoComplete="off"
			/>
		</div>
	);
}

// --- End Subtask Components ---

interface TasksPluginTagEditorPopoverProps {
	tags: TagType[];
	selectedTagIds: string[];
	onToggleTag: (tagId: string) => void;
	onClose: () => void;
}

function TasksPluginTagEditorPopover({
	tags,
	selectedTagIds,
	onToggleTag,
	onClose,
}: TasksPluginTagEditorPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [onClose]);

	return (
		<div
			ref={popoverRef}
			className="absolute left-0 top-full z-10 mt-1 flex w-[280px] flex-col rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
				<span className="text-[11px] font-medium text-white/50">Tags</span>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onClose();
					}}
					className="flex h-5 w-5 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					aria-label="Close"
				>
					<X className="h-3 w-3" />
				</button>
			</div>

			<div className="grid grid-cols-3 gap-1.5 p-2">
				{tags.map((tag) => {
					const isSelected = selectedTagIds.includes(tag.id);

					return (
						<button
							key={tag.id}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onToggleTag(tag.id);
							}}
							className={`flex cursor-pointer items-center justify-center gap-1 truncate rounded px-2 py-1.5 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] ${
								isSelected ? "ring-1 ring-white/30" : ""
							}`}
							style={{
								backgroundColor: `${tag.color}${isSelected ? "40" : "20"}`,
								color: tag.color,
							}}
							title={isSelected ? `Remove ${tag.name}` : `Add ${tag.name}`}
						>
							{isSelected && <Check className="h-3 w-3 shrink-0" />}
							<span className="truncate">{tag.name}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

interface TasksPluginTagBadgeProps {
	tag: TagType;
	isCompleted?: boolean;
}

function TasksPluginTagBadge({
	tag,
	isCompleted = false,
}: TasksPluginTagBadgeProps) {
	return (
		<span
			className={`inline-flex max-w-[80px] items-center truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight tracking-[-0.01em] transition-opacity duration-150 ease-out ${
				isCompleted ? "opacity-40" : "opacity-100"
			}`}
			style={{
				backgroundColor: `${tag.color}20`,
				color: tag.color,
			}}
			title={tag.name}
		>
			{tag.name}
		</span>
	);
}

// --- Folder Components ---

interface TasksPluginFolderInputProps {
	value: string;
	onChange: (value: string) => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
	onBlur: () => void;
}

const FOLDER_NAME_MAX_LENGTH = 25;

function TasksPluginFolderInput({
	value,
	onChange,
	onKeyDown,
	onBlur,
}: TasksPluginFolderInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isNearLimit = value.length >= FOLDER_NAME_MAX_LENGTH - 5;
	const isAtLimit = value.length >= FOLDER_NAME_MAX_LENGTH;

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div className="mb-3">
			<div className="relative">
				<input
					ref={inputRef}
					type="text"
					placeholder="Folder name..."
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={onKeyDown}
					onBlur={onBlur}
					maxLength={FOLDER_NAME_MAX_LENGTH}
					className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 pr-12 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					autoComplete="off"
				/>
				{isNearLimit && (
					<span
						className={cn(
							"absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium transition-colors",
							isAtLimit ? "text-amber-500" : "text-white/30",
						)}
					>
						{value.length}/{FOLDER_NAME_MAX_LENGTH}
					</span>
				)}
			</div>
		</div>
	);
}

function TasksPluginFoldersEmptyState({ onCreate }: { onCreate: () => void }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/35">
			<FolderOpen className="h-10 w-10 opacity-40" />
			<p className="text-[13px] font-normal tracking-[-0.01em]">
				No folders yet
			</p>
			<button
				type="button"
				onClick={onCreate}
				className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/12 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
			>
				<Plus className="h-3.5 w-3.5" />
				Create folder
			</button>
		</div>
	);
}

interface TasksPluginFolderListProps {
	folders: Folder[];
	onFolderClick: (folderId: string) => void;
	onReorder: (folderIds: string[]) => void;
}

function TasksPluginFolderList({
	folders,
	onFolderClick,
	onReorder,
}: TasksPluginFolderListProps) {
	// Sort folders by position
	const sortedFolders = [...folders].sort((a, b) => a.position - b.position);

	// Drag state using mouse events (HTML5 drag API is broken in Tauri/WebKitGTK on Linux)
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(
		null,
	);
	const [isActiveDrag, setIsActiveDrag] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const dragStartPos = useRef<{ x: number; y: number } | null>(null);
	const isDraggingRef = useRef(false);

	// Get the dragged folder for ghost rendering
	const draggedFolder = useMemo(() => {
		if (!draggedId) return null;
		return sortedFolders.find((f) => f.id === draggedId) ?? null;
	}, [sortedFolders, draggedId]);

	// Calculate where the ghost should appear (index in the list)
	// Returns -1 if ghost shouldn't be shown (e.g., when it would be adjacent to dragged card)
	const ghostInsertIndex = useMemo(() => {
		if (!isActiveDrag || !draggedId || !dragOverId || !dropPosition) return -1;

		const draggedIndex = sortedFolders.findIndex((f) => f.id === draggedId);
		const targetIndex = sortedFolders.findIndex((f) => f.id === dragOverId);
		if (draggedIndex === -1 || targetIndex === -1) return -1;

		const insertIndex =
			dropPosition === "above" ? targetIndex : targetIndex + 1;

		// Don't show ghost if it would appear directly above or below the dragged card
		// (insertIndex === draggedIndex means directly above, insertIndex === draggedIndex + 1 means directly below)
		if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
			return -1;
		}

		return insertIndex;
	}, [sortedFolders, isActiveDrag, draggedId, dragOverId, dropPosition]);

	const handleMouseDown = (e: React.MouseEvent, folderId: string) => {
		// Only start drag tracking on left click
		if (e.button !== 0) return;
		dragStartPos.current = { x: e.clientX, y: e.clientY };
		setDraggedId(folderId);
	};

	// Store original card positions when drag starts (for stable hit detection)
	const originalPositions = useRef<
		Map<string, { top: number; bottom: number; midY: number }>
	>(new Map());
	const lastDropTarget = useRef<{
		id: string;
		position: "above" | "below";
	} | null>(null);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!draggedId || !dragStartPos.current) return;

			// Require 5px movement to start actual drag (prevents accidental drags on click)
			const dx = e.clientX - dragStartPos.current.x;
			const dy = e.clientY - dragStartPos.current.y;
			if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) < 5) return;

			if (!isDraggingRef.current) {
				isDraggingRef.current = true;
				setIsActiveDrag(true);
				document.body.classList.add("dragging-folder");

				// Capture original positions of all cards at drag start
				originalPositions.current.clear();
				for (const [folderId, cardEl] of cardRefs.current.entries()) {
					const rect = cardEl.getBoundingClientRect();
					originalPositions.current.set(folderId, {
						top: rect.top,
						bottom: rect.bottom,
						midY: rect.top + rect.height / 2,
					});
				}
			}

			let foundTarget = false;
			const cursorY = e.clientY;

			const sortedCards = Array.from(originalPositions.current.entries())
				.filter(([id]) => id !== draggedId)
				.sort((a, b) => a[1].top - b[1].top);

			// Hysteresis prevents flickering when cursor is near zone boundaries
			const hysteresis = lastDropTarget.current ? 8 : 0;

			for (let i = 0; i < sortedCards.length; i++) {
				const [folderId, pos] = sortedCards[i];
				const isCurrentTarget = lastDropTarget.current?.id === folderId;

				const prevCard = i > 0 ? sortedCards[i - 1][1] : null;
				const nextCard =
					i < sortedCards.length - 1 ? sortedCards[i + 1][1] : null;

				const aboveZoneTop = prevCard ? prevCard.midY : pos.top - 100;
				const aboveZoneBottom = pos.midY;
				const belowZoneTop = pos.midY;
				const belowZoneBottom = nextCard ? nextCard.midY : pos.bottom + 100;

				const aboveTopThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "above"
						? aboveZoneTop - hysteresis
						: aboveZoneTop;
				const belowBottomThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "below"
						? belowZoneBottom + hysteresis
						: belowZoneBottom;

				if (cursorY >= aboveTopThreshold && cursorY < aboveZoneBottom) {
					if (dragOverId !== folderId || dropPosition !== "above") {
						setDragOverId(folderId);
						setDropPosition("above");
						lastDropTarget.current = { id: folderId, position: "above" };
					}
					foundTarget = true;
					break;
				}

				if (cursorY >= belowZoneTop && cursorY <= belowBottomThreshold) {
					if (dragOverId !== folderId || dropPosition !== "below") {
						setDragOverId(folderId);
						setDropPosition("below");
						lastDropTarget.current = { id: folderId, position: "below" };
					}
					foundTarget = true;
					break;
				}
			}

			if (!foundTarget) {
				setDragOverId(null);
				setDropPosition(null);
				lastDropTarget.current = null;
			}
		},
		[draggedId, dragOverId, dropPosition],
	);

	const handleMouseUp = useCallback(() => {
		if (draggedId && isDraggingRef.current && dragOverId && dropPosition) {
			// Perform the reorder
			const newOrder = [...sortedFolders];
			const draggedIndex = newOrder.findIndex((f) => f.id === draggedId);
			const targetIndex = newOrder.findIndex((f) => f.id === dragOverId);

			if (draggedIndex !== -1 && targetIndex !== -1) {
				const [draggedItem] = newOrder.splice(draggedIndex, 1);

				let insertIndex = targetIndex;
				if (dropPosition === "below") {
					insertIndex =
						draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
				} else {
					insertIndex =
						draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
				}

				newOrder.splice(insertIndex, 0, draggedItem);
				onReorder(newOrder.map((f) => f.id));
			}
		}

		// Reset state
		setDraggedId(null);
		setDragOverId(null);
		setDropPosition(null);
		setIsActiveDrag(false);
		dragStartPos.current = null;
		isDraggingRef.current = false;
		originalPositions.current.clear();
		lastDropTarget.current = null;
		document.body.classList.remove("dragging-folder");
	}, [draggedId, dragOverId, dropPosition, sortedFolders, onReorder]);

	// Global mouse event listeners for drag
	useEffect(() => {
		if (draggedId) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			return () => {
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};
		}
	}, [draggedId, handleMouseMove, handleMouseUp]);

	const setCardRef = useCallback(
		(folderId: string, el: HTMLDivElement | null) => {
			if (el) {
				cardRefs.current.set(folderId, el);
			} else {
				cardRefs.current.delete(folderId);
			}
		},
		[],
	);

	// Build render items: all folders stay in place, ghost inserted at drop position
	const renderItems = useMemo(() => {
		const items: Array<{
			type: "folder" | "ghost";
			folder: Folder;
			key: string;
		}> = [];

		sortedFolders.forEach((folder, index) => {
			// Insert ghost before this folder if this is the ghost position
			if (ghostInsertIndex === index && draggedFolder) {
				items.push({ type: "ghost", folder: draggedFolder, key: "ghost" });
			}

			// Always render the folder (including dragged one - it just gets faded)
			items.push({ type: "folder", folder, key: folder.id });
		});

		// Ghost at the end (after all folders)
		if (ghostInsertIndex === sortedFolders.length && draggedFolder) {
			items.push({ type: "ghost", folder: draggedFolder, key: "ghost" });
		}

		return items;
	}, [sortedFolders, ghostInsertIndex, draggedFolder]);

	return (
		<div
			ref={containerRef}
			className="-mx-2 flex flex-1 flex-col gap-1.5 overflow-y-auto px-2"
		>
			<AnimatePresence mode="popLayout">
				{renderItems.map((item) => {
					if (item.type === "ghost") {
						return (
							<motion.div
								key="ghost"
								initial={{ opacity: 0, scale: 0.95, height: 0 }}
								animate={{ opacity: 1, scale: 1, height: "auto" }}
								exit={{ opacity: 0, scale: 0.95, height: 0 }}
								transition={{ duration: 0.15, ease: "easeOut" }}
							>
								<TasksPluginFolderGhost folder={item.folder} />
							</motion.div>
						);
					}

					return (
						<motion.div
							key={item.key}
							layout
							layoutId={item.folder.id}
							transition={{
								layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
							}}
						>
							<TasksPluginFolderCard
								folder={item.folder}
								onClick={() => {
									// Only trigger click if not dragging
									if (!isDraggingRef.current) {
										onFolderClick(item.folder.id);
									}
								}}
								isDragging={
									draggedId === item.folder.id && isDraggingRef.current
								}
								onMouseDown={(e) => handleMouseDown(e, item.folder.id)}
								cardRef={(el) => setCardRef(item.folder.id, el)}
							/>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
}

interface TasksPluginFolderCardProps {
	folder: Folder;
	onClick: () => void;
	isDragging?: boolean;
	onMouseDown?: (e: React.MouseEvent) => void;
	cardRef?: (el: HTMLDivElement | null) => void;
}

function TasksPluginFolderCard({
	folder,
	onClick,
	isDragging = false,
	onMouseDown,
	cardRef,
}: TasksPluginFolderCardProps) {
	return (
		<div
			ref={cardRef}
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			onMouseDown={onMouseDown}
			className={cn(
				"group flex w-full flex-col gap-2 rounded-lg text-left cursor-pointer select-none",
				"border border-white/[0.04] bg-white/[0.02]",
				"px-3.5 py-3 transition-all duration-150 ease-out",
				"hover:border-white/[0.08] hover:bg-white/[0.04]",
				"hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
				"active:scale-[0.99] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
				isDragging && "opacity-40 scale-[0.97] pointer-events-none",
			)}
		>
			<div className="flex items-center gap-2">
				<GripVertical
					size={14}
					className="shrink-0 text-white/20 transition-colors duration-150 group-hover:text-white/40 cursor-grab"
				/>
				<span className="flex-1 text-[14px] font-medium text-white/90 tracking-[-0.01em]">
					{folder.name}
				</span>
				<span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-white/50">
					{folder.taskCount}
				</span>
			</div>

			<div className="pl-5">
				<TasksPluginFolderPreview recentTasks={folder.recentTasks} />
			</div>
		</div>
	);
}

// Ghost folder shown at drop position during drag
interface TasksPluginFolderGhostProps {
	folder: Folder;
}

function TasksPluginFolderGhost({ folder }: TasksPluginFolderGhostProps) {
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-2 rounded-lg select-none",
				"border border-dashed border-white/20",
				"bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
				"px-3.5 py-3",
				"shadow-[0_0_20px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.05)]",
			)}
		>
			<div className="flex items-center gap-2">
				<GripVertical size={14} className="shrink-0 text-white/30" />
				<span className="flex-1 text-[14px] font-medium text-white/60 tracking-[-0.01em]">
					{folder.name}
				</span>
				<span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/40">
					{folder.taskCount}
				</span>
			</div>

			<div className="pl-5 opacity-50">
				<TasksPluginFolderPreview recentTasks={folder.recentTasks} />
			</div>
		</div>
	);
}

interface TasksPluginFolderPreviewProps {
	recentTasks: RecentTask[];
}

function TasksPluginFolderPreview({
	recentTasks,
}: TasksPluginFolderPreviewProps) {
	if (recentTasks.length === 0) {
		return <span className="text-[12px] text-white/25 italic">(empty)</span>;
	}

	return (
		<div className="flex flex-col gap-1">
			{recentTasks.map((task) => (
				<div key={task.id} className="flex items-center gap-2">
					<span
						className={cn(
							"h-1.5 w-1.5 shrink-0 rounded-full",
							task.status === "completed" && "bg-white/30",
							task.status === "in_progress" && "bg-amber-500/70",
							task.status === "pending" && "bg-white/40",
						)}
					/>
					<span
						className={cn(
							"truncate text-[12px] tracking-[-0.01em]",
							task.status === "completed"
								? "text-white/30 line-through decoration-white/20"
								: "text-white/50",
						)}
					>
						{task.text}
					</span>
				</div>
			))}
		</div>
	);
}

// --- Folder Settings Components ---

interface TasksPluginFolderSettingsMenuProps {
	onRename: () => void;
	onDelete: () => void;
	onClose: () => void;
	taskCount: number;
	tagCount: number;
}

function TasksPluginFolderSettingsMenu({
	onRename,
	onDelete,
	onClose,
	taskCount,
	tagCount,
}: TasksPluginFolderSettingsMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [onClose]);

	return (
		<div
			ref={menuRef}
			className="absolute right-0 top-full z-20 mt-1 w-[180px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg"
			onClick={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				onClick={onRename}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/6"
			>
				<Pencil size={14} className="text-white/50" />
				Rename
			</button>
			<button
				type="button"
				onClick={onDelete}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-400 transition-colors hover:bg-red-500/10"
			>
				<X size={14} />
				Delete
			</button>
			<div className="mx-2 my-1 border-t border-white/[0.06]" />
			<div className="px-3 py-1.5 text-[11px] text-white/30">
				{taskCount} task{taskCount !== 1 ? "s" : ""}, {tagCount} tag
				{tagCount !== 1 ? "s" : ""}
			</div>
		</div>
	);
}

interface TasksPluginRenameFolderModalProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
	onClose: () => void;
}

function TasksPluginRenameFolderModal({
	value,
	onChange,
	onSubmit,
	onKeyDown,
	onClose,
}: TasksPluginRenameFolderModalProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isNearLimit = value.length >= FOLDER_NAME_MAX_LENGTH - 5;
	const isAtLimit = value.length >= FOLDER_NAME_MAX_LENGTH;

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[280px] rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="rename-folder-title"
			>
				<div className="mb-3 flex items-center justify-between">
					<h2
						id="rename-folder-title"
						className="text-[14px] font-medium text-white/90"
					>
						Rename Folder
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="relative">
					<input
						ref={inputRef}
						type="text"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						onKeyDown={onKeyDown}
						maxLength={FOLDER_NAME_MAX_LENGTH}
						className="h-10 w-full rounded-[10px] border border-white/10 bg-white/6 px-3.5 pr-12 text-[13px] tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 focus:border-white/20 focus:bg-white/8"
						autoComplete="off"
					/>
					{isNearLimit && (
						<span
							className={cn(
								"absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium transition-colors",
								isAtLimit ? "text-amber-500" : "text-white/30",
							)}
						>
							{value.length}/{FOLDER_NAME_MAX_LENGTH}
						</span>
					)}
				</div>

				<div className="mt-4 flex gap-2">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 rounded-lg bg-white/6 px-4 py-2 text-[13px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/10 active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onSubmit}
						disabled={!value.trim()}
						className="flex-1 rounded-lg bg-white/90 px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-all duration-150 ease-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

// --- Delete Folder Modal with Countdown ---

interface TasksPluginDeleteFolderModalProps {
	folderName: string;
	taskCount: number;
	tagCount: number;
	onConfirm: () => void;
	onClose: () => void;
}

function TasksPluginDeleteFolderModal({
	folderName,
	taskCount,
	tagCount,
	onConfirm,
	onClose,
}: TasksPluginDeleteFolderModalProps) {
	const [countdown, setCountdown] = useState(3);

	useEffect(() => {
		if (countdown <= 0) return;

		const interval = setInterval(() => {
			setCountdown((prev) => prev - 1);
		}, 1000);

		return () => clearInterval(interval);
	}, [countdown]);

	const isDeleteEnabled = countdown <= 0;

	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[300px] rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="delete-folder-title"
			>
				<div className="mb-3 flex items-center justify-between">
					<h2
						id="delete-folder-title"
						className="text-[14px] font-medium text-white/90"
					>
						Delete Folder
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<p className="text-[13px] text-white/70 leading-relaxed">
					Delete <span className="font-medium text-white/90">{folderName}</span>
					? This will remove {taskCount} task{taskCount !== 1 ? "s" : ""} and{" "}
					{tagCount} tag{tagCount !== 1 ? "s" : ""}.
				</p>

				<div className="mt-4 flex gap-2">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 rounded-lg bg-white/6 px-4 py-2 text-[13px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/10 active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={!isDeleteEnabled}
						className={cn(
							"flex-1 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-150 ease-out active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
							isDeleteEnabled
								? "bg-red-500 text-white hover:bg-red-600"
								: "bg-red-500/40 text-white/50 cursor-not-allowed",
						)}
					>
						{isDeleteEnabled ? "Delete" : `Delete (${countdown}s)`}
					</button>
				</div>
			</div>
		</div>
	);
}

// --- Manage Tags Modal ---

interface TasksPluginManageTagsModalProps {
	tags: TagType[];
	onCreateTag: (name: string, color: string) => Promise<boolean>;
	onUpdateTag: (id: string, name: string, color: string) => Promise<boolean>;
	onDeleteTag: (id: string) => Promise<void>;
	onClose: () => void;
}

function TasksPluginManageTagsModal({
	tags,
	onCreateTag,
	onUpdateTag,
	onDeleteTag,
	onClose,
}: TasksPluginManageTagsModalProps) {
	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[360px] rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="manage-tags-title"
			>
				<div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
					<h2
						id="manage-tags-title"
						className="text-[14px] font-medium text-white/90"
					>
						Manage Tags
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="p-3">
					<TasksPluginCreateTagRow onCreateTag={onCreateTag} />

					<div className="mt-3">
						<span className="text-[11px] font-medium uppercase tracking-wide text-white/40">
							Tags
						</span>
					</div>

					<div className="mt-2 max-h-[250px] overflow-y-auto">
						{tags.length === 0 ? (
							<div className="flex items-center justify-center py-8">
								<span className="text-[13px] text-white/35">No tags yet</span>
							</div>
						) : (
							<div className="grid grid-cols-2 gap-1">
								{tags.map((tag) => (
									<TasksPluginManageTagRow
										key={tag.id}
										tag={tag}
										allTags={tags}
										onUpdateTag={onUpdateTag}
										onDeleteTag={onDeleteTag}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

interface TasksPluginCreateTagRowProps {
	onCreateTag: (name: string, color: string) => Promise<boolean>;
}

function TasksPluginCreateTagRow({
	onCreateTag,
}: TasksPluginCreateTagRowProps) {
	const [name, setName] = useState("");
	const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0].hex);
	const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

	const handleSubmit = async () => {
		if (!name.trim()) return;

		const success = await onCreateTag(name.trim(), selectedColor);
		if (success) {
			setName("");
			setSelectedColor(TAG_COLORS[0].hex);
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleSubmit();
		}
	};

	return (
		<div className="flex items-center gap-2">
			<div className="relative">
				<button
					type="button"
					onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
					className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-white/4 transition-all duration-150 ease-out hover:bg-white/8 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					aria-label="Select color"
				>
					<span
						className="h-4 w-4 rounded-full"
						style={{ backgroundColor: selectedColor }}
					/>
				</button>

				{isColorPickerOpen && (
					<TasksPluginColorPickerDropdown
						selectedColor={selectedColor}
						onSelectColor={(color) => {
							setSelectedColor(color);
							setIsColorPickerOpen(false);
						}}
						onClose={() => setIsColorPickerOpen(false)}
					/>
				)}
			</div>

			<input
				type="text"
				placeholder="New tag..."
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={handleKeyDown}
				maxLength={20}
				className="h-8 flex-1 rounded-md border border-transparent bg-white/4 px-2.5 text-[13px] text-white/90 outline-none transition-all duration-150 ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6"
				autoComplete="off"
			/>

			<button
				type="button"
				onClick={handleSubmit}
				disabled={!name.trim()}
				className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-white/4 text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
				aria-label="Create tag"
			>
				<Plus className="h-4 w-4" />
			</button>
		</div>
	);
}

interface TasksPluginManageTagRowProps {
	tag: TagType;
	allTags: TagType[];
	onUpdateTag: (id: string, name: string, color: string) => Promise<boolean>;
	onDeleteTag: (id: string) => Promise<void>;
}

function TasksPluginManageTagRow({
	tag,
	allTags,
	onUpdateTag,
	onDeleteTag,
}: TasksPluginManageTagRowProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(tag.name);
	const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
	const { pendingId, handleDeleteClick, cancelDelete } =
		usePendingDelete(onDeleteTag);
	const isPendingDelete = pendingId === tag.id;
	const inputRef = useRef<HTMLInputElement>(null);
	const rowRef = useRef<HTMLDivElement>(null);

	const isDuplicate = allTags.some(
		(t) =>
			t.id !== tag.id && t.name.toLowerCase() === editName.trim().toLowerCase(),
	);
	const isEmpty = !editName.trim();
	const hasError = isDuplicate || isEmpty;

	const startEditing = () => {
		setIsEditing(true);
		setEditName(tag.name);
		cancelDelete();
	};

	const saveEdit = async () => {
		if (hasError) return;
		if (editName.trim() !== tag.name) {
			await onUpdateTag(tag.id, editName.trim(), tag.color);
		}
		setIsEditing(false);
	};

	const cancelEdit = () => {
		setIsEditing(false);
		setEditName(tag.name);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			saveEdit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			cancelEdit();
		}
	};

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	useEffect(() => {
		if (!isEditing) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (rowRef.current && !rowRef.current.contains(event.target as Node)) {
				saveEdit();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isEditing, editName, hasError]);

	const handleColorSelect = async (color: string) => {
		setIsColorPickerOpen(false);
		await onUpdateTag(tag.id, tag.name, color);
	};

	return (
		<div
			ref={rowRef}
			className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/4"
		>
			<div className="relative">
				<button
					type="button"
					onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
					className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent transition-all duration-150 ease-out hover:bg-white/8 active:border-white/15"
					aria-label="Change color"
				>
					<span
						className="h-3 w-3 rounded-full"
						style={{ backgroundColor: tag.color }}
					/>
				</button>

				{isColorPickerOpen && (
					<TasksPluginColorPickerDropdown
						selectedColor={tag.color}
						onSelectColor={handleColorSelect}
						onClose={() => setIsColorPickerOpen(false)}
					/>
				)}
			</div>

			{isEditing ? (
				<>
					<div className="flex min-w-0 flex-1 flex-col">
						<input
							ref={inputRef}
							type="text"
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
							onKeyDown={handleKeyDown}
							maxLength={20}
							className={cn(
								"h-6 w-full rounded border bg-white/6 px-2 text-[12px] text-white/90 outline-none transition-all duration-150",
								hasError
									? "border-red-500/50 focus:border-red-500"
									: "border-transparent focus:border-white/20",
							)}
							autoComplete="off"
						/>
						{isDuplicate && (
							<span className="mt-0.5 text-[10px] text-red-400">
								Name already exists
							</span>
						)}
					</div>

					<button
						type="button"
						onClick={saveEdit}
						disabled={hasError}
						className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-green-400 disabled:cursor-not-allowed disabled:opacity-40 active:border-white/15"
						aria-label="Save"
					>
						<Check className="h-3 w-3" />
					</button>

					<button
						type="button"
						onClick={cancelEdit}
						className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 active:border-white/15"
						aria-label="Cancel"
					>
						<X className="h-3 w-3" />
					</button>
				</>
			) : (
				<>
					<button
						type="button"
						onClick={startEditing}
						className="min-w-0 flex-1 cursor-text truncate text-left text-[12px] text-white/80 transition-colors hover:text-white/95"
					>
						{tag.name}
					</button>

					<button
						type="button"
						onClick={() => handleDeleteClick(tag.id)}
						className={cn(
							"flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent transition-all duration-150 ease-out active:border-white/15",
							isPendingDelete
								? "bg-red-500/20 text-red-500"
								: "text-white/30 opacity-0 hover:bg-white/8 hover:text-red-400 group-hover:opacity-100",
						)}
						aria-label={isPendingDelete ? "Confirm delete" : "Delete tag"}
					>
						{isPendingDelete ? (
							<Check className="h-3 w-3" />
						) : (
							<Trash2 className="h-3 w-3" />
						)}
					</button>
				</>
			)}
		</div>
	);
}

interface TasksPluginColorPickerDropdownProps {
	selectedColor: string;
	onSelectColor: (color: string) => void;
	onClose: () => void;
}

function TasksPluginColorPickerDropdown({
	selectedColor,
	onSelectColor,
	onClose,
}: TasksPluginColorPickerDropdownProps) {
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [onClose]);

	return (
		<div
			ref={dropdownRef}
			className="absolute left-0 top-full z-50 mt-1 w-max rounded-lg border border-white/10 bg-[#0a0a0a] p-2 shadow-lg"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="grid grid-cols-4 gap-1">
				{TAG_COLORS.map((color) => (
					<button
						key={color.hex}
						type="button"
						onClick={() => onSelectColor(color.hex)}
						className={cn(
							"flex h-6 w-6 items-center justify-center rounded-md border transition-all duration-150 ease-out hover:scale-110",
							selectedColor === color.hex
								? "border-white/40"
								: "border-transparent hover:border-white/20",
						)}
						aria-label={color.name}
						title={color.name}
					>
						<span
							className="h-3.5 w-3.5 rounded-full"
							style={{ backgroundColor: color.hex }}
						/>
					</button>
				))}
			</div>
		</div>
	);
}

export { TasksPlugin, TAG_COLORS };
