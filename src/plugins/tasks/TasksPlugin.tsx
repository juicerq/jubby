import { open } from "@tauri-apps/plugin-dialog";
import {
	Check,
	ChevronRight,
	Code2,
	FolderOpen,
	GitCommitHorizontal,
	GripVertical,
	Minus,
	Pencil,
	Play,
	Plus,
	Settings,
	Square,
	Tag,
	TestTube2,
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
import { TasksPluginTaskDetail } from "./TasksPluginTaskDetail";
import type {
	ExecutionLog,
	Folder,
	RecentTask,
	Step,
	Subtask,
	SubtaskCategory,
	SubtaskStatus,
	Tag as TagType,
	Task,
	TaskStatus,
} from "./types";
import {
	useFolderStorage,
	useOpenCodeServer,
	usePendingDelete,
	useTasksStorage,
} from "./useTasksStorage";

const LAST_WORKING_DIR_KEY = "tasks_lastWorkingDirectory";

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
	const { status: serverStatus, startServer } = useOpenCodeServer();

	useEffect(() => {
		startServer();
	}, [startServer]);

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
		isExecuting,
		executingSubtaskId,
		createTask,
		updateTaskStatus,
		updateTaskText,
		deleteTask,
		setTaskTags,
		createTag,
		updateTag,
		deleteTag,
		createSubtask,
		updateSubtaskStatus,
		updateSubtaskCategory,
		updateSubtaskNotes,
		updateSubtaskShouldCommit,
		deleteSubtask,
		reorderSubtasks,
		updateSubtaskText,
		createStep,
		toggleStep,
		deleteStep,
		updateStepText,
		executeSubtask,
		abortExecution,
		isLooping,
		startLoop,
		stopLoop,
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

	const activeTasks = filteredTasks.filter((t) => t.status !== "completed");
	const completedTasks = filteredTasks.filter((t) => t.status === "completed");

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

	const serverStatusIndicator =
		serverStatus === "starting" ? (
			<div className="flex items-center gap-1.5 text-white/40">
				<span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/50" />
				<span className="text-[11px]">Starting server...</span>
			</div>
		) : null;

	if (view === "task" && currentTask) {
		return (
			<div className="flex h-full flex-col overflow-hidden">
				<Breadcrumb right={serverStatusIndicator} />
				<TasksPluginTaskDetail
					task={currentTask}
					tags={tags}
					onDeleteTask={deleteTask}
					onUpdateTaskStatus={updateTaskStatus}
					onUpdateTaskText={updateTaskText}
					onSetTaskTags={setTaskTags}
					onCreateSubtask={createSubtask}
					onUpdateSubtaskStatus={updateSubtaskStatus}
					onDeleteSubtask={deleteSubtask}
					onReorderSubtasks={reorderSubtasks}
					onUpdateSubtaskText={updateSubtaskText}
					onUpdateSubtaskCategory={updateSubtaskCategory}
					onUpdateSubtaskNotes={updateSubtaskNotes}
					onUpdateSubtaskShouldCommit={updateSubtaskShouldCommit}
					onCreateStep={createStep}
					onToggleStep={toggleStep}
					onDeleteStep={deleteStep}
					onUpdateStepText={updateStepText}
					onExecuteSubtask={executeSubtask}
					onAbortExecution={abortExecution}
					isExecuting={isExecuting}
					executingSubtaskId={executingSubtaskId}
					isLooping={isLooping}
					onStartLoop={startLoop}
					onStopLoop={stopLoop}
					onNavigateBack={handleNavigateToList}
				/>
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
					onCreateTask={createTask}
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
					<div className="-mx-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
						{activeTasks.length > 0 && (
							<TasksPluginList
								tasks={activeTasks}
								tags={tags}
								onToggle={handleToggle}
								onDeleteClick={handleDeleteClick}
								pendingDeleteId={pendingDeleteId}
								editingTagsTaskId={editingTagsTaskId}
								onEditTags={setEditingTagsTaskId}
								onToggleTagOnTask={handleToggleTagOnTask}
								onTaskClick={handleNavigateToTask}
							/>
						)}
						{completedTasks.length > 0 && (
							<>
								<h2 className="mt-4 text-[12px] font-medium text-white/40 uppercase tracking-wide">
									Completeds
								</h2>
								<TasksPluginList
									tasks={completedTasks}
									tags={tags}
									onToggle={handleToggle}
									onDeleteClick={handleDeleteClick}
									pendingDeleteId={pendingDeleteId}
									editingTagsTaskId={editingTagsTaskId}
									onEditTags={setEditingTagsTaskId}
									onToggleTagOnTask={handleToggleTagOnTask}
									onTaskClick={handleNavigateToTask}
								/>
							</>
						)}
					</div>
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
	onCreateTask: (
		text: string,
		tagIds: string[] | undefined,
		description: string,
		workingDirectory: string,
	) => void;
	onTagsClick: () => void;
	tags: TagType[];
	selectedTagIds: string[];
	onToggleTag: (tagId: string) => void;
}

function TasksPluginInputArea({
	value,
	onChange,
	onCreateTask,
	onTagsClick,
	tags,
	selectedTagIds,
	onToggleTag,
}: TasksPluginInputAreaProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [description, setDescription] = useState("");
	const [workingDirectory, setWorkingDirectory] = useState(() => {
		return localStorage.getItem(LAST_WORKING_DIR_KEY) ?? "";
	});
	const [workingDirectoryError, setWorkingDirectoryError] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLDivElement>(null);

	const shouldShowExpandedForm = isExpanded || value.trim().length > 0;

	const handleFocus = () => {
		setIsExpanded(true);
	};

	const handleSelectFolder = async () => {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: "Select working directory",
			});
			if (selected) {
				setWorkingDirectory(selected);
				setWorkingDirectoryError("");
				localStorage.setItem(LAST_WORKING_DIR_KEY, selected);
			}
		} catch (error) {
			console.error("Failed to open folder picker:", error);
		}
	};

	const handleSubmit = () => {
		if (!value.trim()) return;

		if (!workingDirectory.trim()) {
			setWorkingDirectoryError("Working directory is required");
			return;
		}

		onCreateTask(
			value.trim(),
			selectedTagIds.length > 0 ? selectedTagIds : undefined,
			description.trim(),
			workingDirectory.trim(),
		);

		onChange("");
		setDescription("");
		setWorkingDirectoryError("");
		setIsExpanded(false);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && value.trim()) {
			e.preventDefault();
			handleSubmit();
		} else if (e.key === "Escape") {
			handleCancel();
		}
	};

	const handleCancel = useCallback(() => {
		onChange("");
		setDescription("");
		setWorkingDirectoryError("");
		setIsExpanded(false);
		inputRef.current?.blur();
	}, [onChange]);

	useEffect(() => {
		if (!shouldShowExpandedForm) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (formRef.current && !formRef.current.contains(e.target as Node)) {
				if (!value.trim()) {
					handleCancel();
				}
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [shouldShowExpandedForm, value, handleCancel]);

	return (
		<div
			ref={formRef}
			className="flex shrink-0 flex-col"
			onClick={(e) => e.stopPropagation()}
		>
			<motion.div
				className="overflow-hidden rounded-[10px] border border-transparent bg-white/4 transition-colors duration-180ms ease-out"
				animate={{
					borderColor: shouldShowExpandedForm
						? "rgba(255, 255, 255, 0.08)"
						: "transparent",
					backgroundColor: shouldShowExpandedForm
						? "rgba(255, 255, 255, 0.06)"
						: "rgba(255, 255, 255, 0.04)",
				}}
				transition={{ duration: 0.18 }}
			>
				<div className="flex gap-2 p-1.5">
					<div className="relative flex-1">
						<input
							ref={inputRef}
							type="text"
							placeholder="What needs to be done?"
							value={value}
							onChange={(e) => {
								onChange(e.target.value);
								setWorkingDirectoryError("");
							}}
							onFocus={handleFocus}
							onKeyDown={handleKeyDown}
							className="h-8 w-full rounded-md bg-transparent px-2.5 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none placeholder:text-white/35"
							autoComplete="off"
						/>
					</div>
					<TasksPluginTagButton onClick={onTagsClick} small />
				</div>

				<AnimatePresence>
					{shouldShowExpandedForm && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
							className="overflow-hidden"
						>
							<div className="flex flex-col gap-2.5 px-1.5 pb-2.5">
								<div className="h-px bg-white/6" />

								<div className="flex flex-col gap-1.5">
									<span className="px-1 text-[11px] font-medium text-white/40">
										Description
									</span>
									<textarea
										placeholder="Add more details..."
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										rows={2}
										aria-label="Description"
										className="w-full resize-none rounded-md border border-transparent bg-white/4 px-2.5 py-2 text-[12px] font-normal leading-relaxed text-white/90 outline-none transition-all duration-180ms ease-out placeholder:text-white/30 hover:bg-white/6 focus:border-white/10 focus:bg-white/6"
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<span className="px-1 text-[11px] font-medium text-white/40">
										Working Directory
									</span>
									<div className="flex gap-1.5">
										<input
											type="text"
											placeholder="/path/to/project"
											value={workingDirectory}
											onChange={(e) => {
												setWorkingDirectory(e.target.value);
												setWorkingDirectoryError("");
												if (e.target.value) {
													localStorage.setItem(
														LAST_WORKING_DIR_KEY,
														e.target.value,
													);
												}
											}}
											aria-label="Working directory"
											className={cn(
												"h-8 flex-1 rounded-md border bg-white/4 px-2.5 text-[12px] font-normal text-white/90 outline-none transition-all duration-180ms ease-out placeholder:text-white/30 hover:bg-white/6 focus:bg-white/6",
												workingDirectoryError
													? "border-red-500/50 focus:border-red-500/70"
													: "border-transparent focus:border-white/10",
											)}
										/>
										<button
											type="button"
											onClick={handleSelectFolder}
											className="group flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-white/4 transition-all duration-180ms ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96]"
											aria-label="Select folder"
											title="Select folder"
										>
											<FolderOpen className="h-3.5 w-3.5 text-white/40 transition-colors duration-180ms ease-out group-hover:text-white/70" />
										</button>
									</div>
									{workingDirectoryError && (
										<span className="px-1 text-[11px] text-red-400">
											{workingDirectoryError}
										</span>
									)}
								</div>

								{tags.length > 0 && (
									<div className="flex flex-col gap-1.5">
										<span className="px-1 text-[11px] font-medium text-white/40">
											Tags
										</span>
										<TasksPluginTagSelector
											tags={tags}
											selectedTagIds={selectedTagIds}
											onToggleTag={onToggleTag}
										/>
									</div>
								)}

								<div className="flex justify-end gap-1.5 pt-1">
									<button
										type="button"
										onClick={handleCancel}
										className="h-7 cursor-pointer rounded-md px-3 text-[11px] font-medium text-white/50 transition-all duration-180ms ease-out hover:bg-white/6 hover:text-white/70"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleSubmit}
										disabled={!value.trim()}
										className="h-7 cursor-pointer rounded-md bg-white/10 px-3 text-[11px] font-medium text-white/90 transition-all duration-180ms ease-out hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
									>
										Create Task
									</button>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</div>
	);
}

function TasksPluginTagButton({
	onClick,
	small,
}: {
	onClick: () => void;
	small?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			className={cn(
				"group flex shrink-0 cursor-pointer items-center justify-center border border-transparent transition-all duration-180ms ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
				small
					? "h-8 w-8 rounded-md bg-white/4"
					: "h-10 w-10 rounded-[10px] bg-white/4",
			)}
			aria-label="Manage tags"
			title="Manage tags"
		>
			<Tag
				className={cn(
					"text-white/40 transition-colors duration-180ms ease-out group-hover:text-white/70",
					small ? "h-3.5 w-3.5" : "h-4 w-4",
				)}
			/>
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
	onTaskClick: (taskId: string) => void;
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
	onTaskClick,
}: TasksPluginListProps) {
	return (
		<>
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
					onTaskClick={() => onTaskClick(task.id)}
				/>
			))}
		</>
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
	onTaskClick: () => void;
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
	onTaskClick,
}: TasksPluginItemProps) {
	const taskTags = (task.tagIds ?? [])
		.map((tagId) => tags.find((t) => t.id === tagId))
		.filter((t): t is TagType => t !== undefined);

	const hasTags = tags.length > 0;
	const hasSubtasks = task.subtasks.length > 0;
	const completedCount = task.subtasks.filter(
		(s) => s.status === "completed",
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

interface TasksPluginSubtaskListProps {
	subtasks: Subtask[];
	onUpdateSubtaskStatus: (subtaskId: string, status: SubtaskStatus) => void;
	onDeleteSubtask: (subtaskId: string) => void;
	onReorderSubtasks: (subtaskIds: string[]) => void;
	onUpdateSubtaskText: (subtaskId: string, text: string) => void;
	onUpdateSubtaskCategory: (
		subtaskId: string,
		category: SubtaskCategory,
	) => void;
	onUpdateSubtaskNotes: (subtaskId: string, notes: string) => void;
	onUpdateSubtaskShouldCommit: (
		subtaskId: string,
		shouldCommit: boolean,
	) => void;
	onCreateStep: (subtaskId: string, text: string) => void;
	onToggleStep: (subtaskId: string, stepId: string) => void;
	onDeleteStep: (subtaskId: string, stepId: string) => void;
	onUpdateStepText: (subtaskId: string, stepId: string, text: string) => void;
	onExecuteSubtask: (subtaskId: string) => void;
	onAbortExecution: () => void;
	isExecuting: boolean;
	executingSubtaskId: string | null;
}

function TasksPluginSubtaskList({
	subtasks,
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
}: TasksPluginSubtaskListProps) {
	const {
		pendingId: pendingDeleteId,
		handleDeleteClick,
		cancelDelete,
	} = usePendingDelete(onDeleteSubtask);

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
		cancelDelete();
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
							<TasksPluginSubtaskExpandable
								subtask={item.subtask}
								onUpdateStatus={(status) =>
									onUpdateSubtaskStatus(item.subtask.id, status)
								}
								onDeleteClick={() => handleDeleteClick(item.subtask.id)}
								isPendingDelete={pendingDeleteId === item.subtask.id}
								onUpdateText={(text) =>
									onUpdateSubtaskText(item.subtask.id, text)
								}
								onUpdateCategory={(category) =>
									onUpdateSubtaskCategory(item.subtask.id, category)
								}
								onUpdateNotes={(notes) =>
									onUpdateSubtaskNotes(item.subtask.id, notes)
								}
								onUpdateShouldCommit={(shouldCommit) =>
									onUpdateSubtaskShouldCommit(item.subtask.id, shouldCommit)
								}
								onCreateStep={(text) => onCreateStep(item.subtask.id, text)}
								onToggleStep={(stepId) => onToggleStep(item.subtask.id, stepId)}
								onDeleteStep={(stepId) => onDeleteStep(item.subtask.id, stepId)}
								onUpdateStepText={(stepId, text) =>
									onUpdateStepText(item.subtask.id, stepId, text)
								}
								onExecute={() => onExecuteSubtask(item.subtask.id)}
								onAbort={onAbortExecution}
								isExecuting={isExecuting}
								isThisExecuting={executingSubtaskId === item.subtask.id}
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
					subtask.status === "completed"
						? "border-white/30 bg-white/30"
						: "border-white/15 bg-transparent",
				)}
			>
				{subtask.status === "completed" && (
					<Check className="h-2 w-2 text-[#0a0a0a]/50" />
				)}
			</div>

			<span className="flex-1 select-none text-[12px] leading-tight tracking-[-0.01em] text-white/40">
				{subtask.text}
			</span>
		</div>
	);
}

interface TasksPluginSubtaskExpandableProps {
	subtask: Subtask;
	onUpdateStatus: (status: SubtaskStatus) => void;
	onDeleteClick: () => void;
	isPendingDelete: boolean;
	onUpdateText: (text: string) => void;
	onUpdateCategory: (category: SubtaskCategory) => void;
	onUpdateNotes: (notes: string) => void;
	onUpdateShouldCommit: (shouldCommit: boolean) => void;
	onCreateStep: (text: string) => void;
	onToggleStep: (stepId: string) => void;
	onDeleteStep: (stepId: string) => void;
	onUpdateStepText: (stepId: string, text: string) => void;
	onExecute: () => void;
	onAbort: () => void;
	isExecuting: boolean;
	isThisExecuting: boolean;
	isDragging?: boolean;
	isAnyDragging?: boolean;
	onMouseDown?: (e: React.MouseEvent) => void;
	itemRef?: (el: HTMLDivElement | null) => void;
}

function TasksPluginSubtaskExpandable({
	subtask,
	onUpdateStatus,
	onDeleteClick,
	isPendingDelete,
	onUpdateText,
	onUpdateCategory,
	onUpdateNotes,
	onUpdateShouldCommit,
	onCreateStep,
	onToggleStep,
	onDeleteStep,
	onUpdateStepText,
	onExecute,
	onAbort,
	isExecuting,
	isThisExecuting,
	isDragging = false,
	isAnyDragging = false,
	onMouseDown,
	itemRef,
}: TasksPluginSubtaskExpandableProps) {
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
	const lastLog =
		subtask.executionLogs.length > 0
			? subtask.executionLogs[subtask.executionLogs.length - 1]
			: null;

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

	const formatLogTime = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div
			ref={itemRef}
			className={cn(
				"group/subtask flex flex-col rounded-md transition-all duration-150 ease-out",
				isDragging && "opacity-40 scale-[0.98] pointer-events-none",
				isExpanded && "bg-white/[0.02]",
				isThisExecuting && "neon-border-executing",
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
							: "border-white/25 bg-transparent hover:border-white/40",
					)}
					aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
				>
					{isCompleted && <Check className="h-2 w-2 text-[#0a0a0a]" />}
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

				<TasksPluginSubtaskExpandableStatusBadge status={subtask.status} />

				<TasksPluginSubtaskExpandableCategoryBadge
					category={subtask.category}
				/>

				{isThisExecuting ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onAbort();
						}}
						className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded bg-red-500/20 transition-all duration-150 ease-out hover:bg-red-500/30 active:scale-90"
						aria-label="Stop execution"
					>
						<Square className="h-2.5 w-2.5 fill-red-400 text-red-400" />
					</button>
				) : (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onExecute();
						}}
						disabled={isExecuting}
						className={cn(
							"flex h-5 w-5 shrink-0 items-center justify-center rounded transition-all duration-150 ease-out active:scale-90",
							isExecuting
								? "cursor-not-allowed opacity-30"
								: "cursor-pointer opacity-0 hover:bg-emerald-500/20 group-hover/subtask:opacity-100",
						)}
						aria-label="Run subtask"
					>
						<Play className="h-3 w-3 fill-emerald-400 text-emerald-400" />
					</button>
				)}

				<motion.div
					animate={{ rotate: isExpanded ? 90 : 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="flex h-5 w-5 shrink-0 items-center justify-center"
				>
					<ChevronRight className="h-3 w-3 text-white/25" />
				</motion.div>

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setIsEditing(true);
					}}
					className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-150 ease-out hover:bg-white/8 group-hover/subtask:opacity-100 active:scale-90"
					aria-label="Edit subtask"
				>
					<Pencil className="h-3 w-3 text-white/40 transition-colors duration-150 hover:text-white/60" />
				</button>

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDeleteClick();
					}}
					className={cn(
						"flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-all duration-150 ease-out active:scale-90",
						isPendingDelete
							? "bg-red-500/20 opacity-100 hover:bg-red-500/30"
							: "opacity-0 hover:bg-red-500/15 group-hover/subtask:opacity-100",
					)}
					aria-label={isPendingDelete ? "Confirm delete" : "Delete subtask"}
				>
					{isPendingDelete ? (
						<Check className="h-3 w-3 text-red-500" />
					) : (
						<X className="h-3 w-3 text-white/30 transition-colors duration-150 hover:text-red-400" />
					)}
				</button>
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

							<TasksPluginSubtaskExpandableSteps
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

							<TasksPluginSubtaskExpandableDetails
								category={subtask.category}
								shouldCommit={subtask.shouldCommit}
								notes={subtask.notes}
								onUpdateCategory={onUpdateCategory}
								onUpdateShouldCommit={onUpdateShouldCommit}
								onUpdateNotes={onUpdateNotes}
							/>

							{lastLog && (
								<>
									<div className="h-px bg-white/8" />
									<TasksPluginSubtaskExpandableLastRun
										log={lastLog}
										totalLogs={subtask.executionLogs.length}
										formatTime={formatLogTime}
									/>
								</>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function TasksPluginSubtaskExpandableStatusBadge({
	status,
}: {
	status: SubtaskStatus;
}) {
	return (
		<span
			className={cn(
				"shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
				status === "waiting" && "bg-white/8 text-white/40",
				status === "in_progress" &&
					"animate-pulse bg-amber-500/20 text-amber-400",
				status === "completed" && "bg-emerald-500/15 text-emerald-400",
			)}
		>
			{status === "in_progress" ? "running" : status}
		</span>
	);
}

function TasksPluginSubtaskExpandableCategoryBadge({
	category,
}: {
	category: SubtaskCategory;
}) {
	return (
		<span
			className={cn(
				"flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
				category === "functional" && "bg-sky-500/15 text-sky-400",
				category === "test" && "bg-violet-500/15 text-violet-400",
			)}
		>
			{category === "functional" ? (
				<Code2 className="h-2.5 w-2.5" />
			) : (
				<TestTube2 className="h-2.5 w-2.5" />
			)}
			{category}
		</span>
	);
}

interface TasksPluginSubtaskExpandableStepsProps {
	steps: Step[];
	newStepValue: string;
	onNewStepValueChange: (value: string) => void;
	onStepKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	onToggleStep: (stepId: string) => void;
	onDeleteStep: (stepId: string) => void;
	onStartEditStep: (step: Step) => void;
	editingStepId: string | null;
	editingStepValue: string;
	onEditingStepValueChange: (value: string) => void;
	onSaveStepEdit: () => void;
	onStepEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	stepInputRef: React.RefObject<HTMLInputElement | null>;
	editStepInputRef: React.RefObject<HTMLInputElement | null>;
}

function TasksPluginSubtaskExpandableSteps({
	steps,
	newStepValue,
	onNewStepValueChange,
	onStepKeyDown,
	onToggleStep,
	onDeleteStep,
	onStartEditStep,
	editingStepId,
	editingStepValue,
	onEditingStepValueChange,
	onSaveStepEdit,
	onStepEditKeyDown,
	stepInputRef,
	editStepInputRef,
}: TasksPluginSubtaskExpandableStepsProps) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
				Steps
			</span>
			<div className="flex flex-col gap-1">
				{steps.map((step) => (
					<div
						key={step.id}
						className="group/step flex items-center gap-2 rounded py-0.5"
					>
						<button
							type="button"
							onClick={() => onToggleStep(step.id)}
							className={cn(
								"flex h-3 w-3 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-all duration-150 ease-out active:scale-[0.9]",
								step.completed
									? "border-white/40 bg-white/40"
									: "border-white/20 bg-transparent hover:border-white/35",
							)}
							aria-label={step.completed ? "Uncheck step" : "Check step"}
						>
							{step.completed && <Check className="h-2 w-2 text-[#0a0a0a]" />}
						</button>

						{editingStepId === step.id ? (
							<input
								ref={editStepInputRef}
								type="text"
								value={editingStepValue}
								onChange={(e) => onEditingStepValueChange(e.target.value)}
								onKeyDown={onStepEditKeyDown}
								onBlur={onSaveStepEdit}
								className="flex-1 bg-transparent text-[11px] leading-tight text-white/60 outline-none"
								autoComplete="off"
							/>
						) : (
							<span
								onDoubleClick={() => onStartEditStep(step)}
								className={cn(
									"flex-1 cursor-text text-[11px] leading-tight transition-all duration-150",
									step.completed
										? "text-white/25 line-through decoration-white/15"
										: "text-white/60",
								)}
							>
								{step.text}
							</span>
						)}

						<button
							type="button"
							onClick={() => onDeleteStep(step.id)}
							className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-150 ease-out hover:bg-red-500/15 group-hover/step:opacity-100 active:scale-90"
							aria-label="Delete step"
						>
							<X className="h-2.5 w-2.5 text-white/30 transition-colors duration-150 hover:text-red-400" />
						</button>
					</div>
				))}

				<div className="flex items-center gap-2 pt-1">
					<Plus className="h-3 w-3 shrink-0 text-white/20" />
					<input
						ref={stepInputRef}
						type="text"
						placeholder="Add step..."
						value={newStepValue}
						onChange={(e) => onNewStepValueChange(e.target.value)}
						onKeyDown={onStepKeyDown}
						className="flex-1 bg-transparent text-[11px] leading-tight text-white/60 outline-none placeholder:text-white/25"
						autoComplete="off"
					/>
				</div>
			</div>
		</div>
	);
}

interface TasksPluginSubtaskExpandableDetailsProps {
	category: SubtaskCategory;
	shouldCommit: boolean;
	notes: string;
	onUpdateCategory: (category: SubtaskCategory) => void;
	onUpdateShouldCommit: (shouldCommit: boolean) => void;
	onUpdateNotes: (notes: string) => void;
}

function TasksPluginSubtaskExpandableDetails({
	category,
	shouldCommit,
	notes,
	onUpdateCategory,
	onUpdateShouldCommit,
	onUpdateNotes,
}: TasksPluginSubtaskExpandableDetailsProps) {
	return (
		<div className="flex flex-col gap-3">
			<span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
				Details
			</span>
			<div className="flex flex-col gap-2.5">
				<div className="flex items-center gap-3">
					<span className="w-16 text-[11px] text-white/45">Category</span>
					<div className="flex gap-1">
						<button
							type="button"
							onClick={() => onUpdateCategory("functional")}
							className={cn(
								"flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all duration-150 ease-out active:scale-[0.97]",
								category === "functional"
									? "bg-sky-500/20 text-sky-400"
									: "bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/55",
							)}
						>
							<Code2 className="h-2.5 w-2.5" />
							Functional
						</button>
						<button
							type="button"
							onClick={() => onUpdateCategory("test")}
							className={cn(
								"flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all duration-150 ease-out active:scale-[0.97]",
								category === "test"
									? "bg-violet-500/20 text-violet-400"
									: "bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/55",
							)}
						>
							<TestTube2 className="h-2.5 w-2.5" />
							Test
						</button>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<span className="w-16 text-[11px] text-white/45">Commit</span>
					<button
						type="button"
						onClick={() => onUpdateShouldCommit(!shouldCommit)}
						className={cn(
							"flex h-5 w-9 items-center rounded-full p-0.5 transition-all duration-200 ease-out",
							shouldCommit ? "bg-emerald-500/30" : "bg-white/10",
						)}
						aria-label={
							shouldCommit ? "Disable auto-commit" : "Enable auto-commit"
						}
					>
						<motion.div
							layout
							transition={{ type: "spring", stiffness: 500, damping: 30 }}
							className={cn(
								"flex h-4 w-4 items-center justify-center rounded-full shadow-sm",
								shouldCommit ? "bg-emerald-400" : "bg-white/50",
							)}
						>
							<GitCommitHorizontal
								className={cn(
									"h-2.5 w-2.5",
									shouldCommit ? "text-emerald-950" : "text-white/50",
								)}
							/>
						</motion.div>
					</button>
					<span className="text-[10px] text-white/35">
						{shouldCommit ? "Auto-commit enabled" : "Manual commit"}
					</span>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className="text-[11px] text-white/45">Notes</span>
					<textarea
						value={notes}
						onChange={(e) => onUpdateNotes(e.target.value)}
						placeholder="Add notes..."
						className="h-16 resize-none rounded-md bg-white/5 px-2 py-1.5 text-[11px] leading-relaxed text-white/60 outline-none placeholder:text-white/25 focus:bg-white/8"
					/>
				</div>
			</div>
		</div>
	);
}

interface TasksPluginSubtaskExpandableLastRunProps {
	log: ExecutionLog;
	totalLogs: number;
	formatTime: (timestamp: number) => string;
}

function TasksPluginSubtaskExpandableLastRun({
	log,
	totalLogs,
	formatTime,
}: TasksPluginSubtaskExpandableLastRunProps) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
					Last Run
				</span>
				{totalLogs > 1 && (
					<span className="cursor-pointer text-[10px] text-white/30 hover:text-white/50">
						see all ({totalLogs})
					</span>
				)}
			</div>
			<div className="flex flex-col gap-1.5 rounded-md bg-white/[0.03] px-2.5 py-2">
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-white/35">
						{formatTime(log.startedAt)}
					</span>
					<span
						className={cn(
							"rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
							log.outcome === "success" && "bg-emerald-500/15 text-emerald-400",
							log.outcome === "partial" && "bg-amber-500/15 text-amber-400",
							log.outcome === "failed" && "bg-red-500/15 text-red-400",
							log.outcome === "aborted" && "bg-white/10 text-white/40",
						)}
					>
						{log.outcome}
					</span>
					{log.duration && (
						<span className="text-[10px] text-white/30">
							{Math.round(log.duration / 1000)}s
						</span>
					)}
				</div>
				{log.summary && (
					<p className="line-clamp-2 text-[11px] leading-relaxed text-white/50">
						{log.summary}
					</p>
				)}
			</div>
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

	const saveEdit = useCallback(async () => {
		if (hasError) return;
		if (editName.trim() !== tag.name) {
			await onUpdateTag(tag.id, editName.trim(), tag.color);
		}
		setIsEditing(false);
	}, [hasError, editName, tag.name, tag.id, tag.color, onUpdateTag]);

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
	}, [isEditing, saveEdit]);

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

export {
	TasksPlugin,
	TasksPluginProgressBadge,
	TasksPluginSubtaskInput,
	TasksPluginSubtaskList,
	TasksPluginTagBadge,
	TasksPluginTagEditorPopover,
	TAG_COLORS,
};
