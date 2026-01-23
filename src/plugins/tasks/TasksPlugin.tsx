import { Plus, Settings } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { Breadcrumb } from "@/core/components/Breadcrumb";
import { useNavigationLevels } from "@/core/hooks";
import type { PluginProps } from "@/core/types";
import { cn } from "@/lib/utils";
import { FolderEmptyState } from "./components/folders/folder-empty-state";
import { FolderInput } from "./components/folders/folder-input";
import { FolderList } from "./components/folders/folder-list";
import { FolderSettingsMenu } from "./components/folders/folder-settings-menu";
import { DeleteFolderModal } from "./components/modals/delete-folder-modal";
import { ManageTagsModal } from "./components/modals/manage-tags-modal";
import { RenameFolderModal } from "./components/modals/rename-folder-modal";
import { TaskDetail } from "./components/tasks/task-detail";
import { TaskEmptyState } from "./components/tasks/task-empty-state";
import { TaskInputArea } from "./components/tasks/task-input-area";
import { TaskList } from "./components/tasks/task-list";
import { TaskSettingsMenu } from "./components/tasks/task-settings-menu";
import { useTasksWatcher } from "./hooks/useTasksWatcher";
import type { SubtaskCategory, SubtaskStatus, TaskStatus } from "./types";
import {
	useFolderStorage,
	useOpenCodeServer,
	usePendingDelete,
	useTasksStorage,
} from "./useTasksStorage";

type TasksView = "folders" | "list" | "task";

const RESYNC_INTERVAL_MS = 5000;

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
		updateFolderWorkingDirectory,
	} = useFolderStorage();

	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
	const [view, setView] = useState<TasksView>("folders");
	const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

	const currentFolder = currentFolderId
		? (folders.find((folder) => folder.id === currentFolderId) ?? null)
		: null;

	const {
		tasks,
		tags,
		isLoading: tasksLoading,
		isExecuting,
		executingSubtaskId,
		reloadTasks,
		createTask,
		updateTaskStatus,
		updateTaskText,
		updateTaskDescription,
		updateTaskWorkingDirectory,
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
		generateSubtasks,
		isTaskGenerating,
		openOpencodeTerminal,
	} = useTasksStorage(currentFolderId ?? "");

	// Handle file system changes - reload tasks when external changes detected
	const handleFolderUpdated = useCallback(
		(folderId: string) => {
			if (view === "folders") {
				loadFolders();
				return;
			}
			if (currentFolderId === folderId) {
				reloadTasks();
			}
		},
		[currentFolderId, loadFolders, reloadTasks, view],
	);

	useTasksWatcher({
		onFolderUpdated: handleFolderUpdated,
		onFoldersUpdated: loadFolders,
	});

	const runResync = useCallback(() => {
		if (view === "folders") {
			loadFolders({ forceReload: true });
			return;
		}
		if (currentFolderId) {
			reloadTasks({ forceReload: true });
		}
	}, [currentFolderId, loadFolders, reloadTasks, view]);

	useEffect(() => {
		const interval = setInterval(runResync, RESYNC_INTERVAL_MS);
		const handleVisibility = () => {
			if (document.visibilityState === "visible") {
				runResync();
			}
		};

		window.addEventListener("focus", runResync);
		document.addEventListener("visibilitychange", handleVisibility);

		return () => {
			clearInterval(interval);
			window.removeEventListener("focus", runResync);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, [runResync]);

	const isLoading =
		view === "folders" ? foldersLoading : foldersLoading || tasksLoading;

	const currentTask = currentTaskId
		? (tasks.find((task) => task.id === currentTaskId) ?? null)
		: null;

	useNavigationLevels([
		{
			id: "tasks",
			label: "Tasks",
			onNavigate: () => {
				setCurrentFolderId(null);
				setCurrentTaskId(null);
				setView("folders");
				loadFolders({ forceReload: true });
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

	useEffect(() => {
		const validTagIds = new Set(tags.map((tag) => tag.id));
		setSelectedTagIds((prev) => {
			const filtered = prev.filter((id) => validTagIds.has(id));
			return filtered.length === prev.length ? prev : filtered;
		});
	}, [tags]);

	const [isCreatingFolder, setIsCreatingFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
	const [isRenamingFolder, setIsRenamingFolder] = useState(false);
	const [renameFolderValue, setRenameFolderValue] = useState("");
	const [isDeletingFolder, setIsDeletingFolder] = useState(false);

	const [isTaskSettingsMenuOpen, setIsTaskSettingsMenuOpen] = useState(false);
	const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);

	const handleNavigateToFolder = (folderId: string) => {
		setCurrentFolderId(folderId);
		setView("list");
		setSelectedTagIds([]);
	};

	const handleNavigateToFolders = () => {
		setCurrentFolderId(null);
		setView("folders");
		loadFolders({ forceReload: true });
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
	const activeTasks = filteredTasks.filter(
		(task) => task.status !== "completed",
	);
	const completedTasks = filteredTasks.filter(
		(task) => task.status === "completed",
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

	const folderAddButton =
		view === "folders" ? (
			<button
				type="button"
				onClick={() => setIsCreatingFolder(true)}
				className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
				aria-label="Create folder"
			>
				<Plus size={16} />
			</button>
		) : undefined;

	const folderSettingsButton =
		view === "list" ? (
			<div className="relative">
				<button
					type="button"
					onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
					className={cn(
						"flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						isSettingsMenuOpen && "bg-white/6 text-white/90",
					)}
					aria-label="Folder settings"
				>
					<Settings size={16} />
				</button>
				{isSettingsMenuOpen && currentFolder && (
					<FolderSettingsMenu
						onRename={handleStartRenameFolder}
						onDelete={handleStartDeleteFolder}
						onClose={() => setIsSettingsMenuOpen(false)}
						taskCount={currentFolder.taskCount}
						tagCount={tags.length}
						workingDirectory={currentFolder.workingDirectory}
						onUpdateWorkingDirectory={(path) =>
							updateFolderWorkingDirectory(currentFolder.id, path)
						}
					/>
				)}
			</div>
		) : undefined;

	if (view === "folders") {
		return (
			<div className="flex h-full flex-col overflow-hidden">
				<Breadcrumb right={folderAddButton} />
				<div className="flex flex-1 flex-col overflow-hidden p-4">
					{isCreatingFolder && (
						<FolderInput
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
						<FolderEmptyState onCreate={() => setIsCreatingFolder(true)} />
					) : (
						<FolderList
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

	const taskSettingsButton = currentTask ? (
		<div className="flex items-center gap-2">
			{serverStatusIndicator}
			<div className="relative">
				<button
					type="button"
					onClick={() => setIsTaskSettingsMenuOpen(!isTaskSettingsMenuOpen)}
					className={cn(
						"flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						isTaskSettingsMenuOpen && "bg-white/6 text-white/90",
					)}
					aria-label="Task settings"
				>
					<Settings size={16} />
				</button>
				{isTaskSettingsMenuOpen && (
					<TaskSettingsMenu
						workingDirectory={currentTask.workingDirectory ?? ""}
						onUpdateWorkingDirectory={(path) =>
							updateTaskWorkingDirectory(currentTask.id, path)
						}
						onClose={() => setIsTaskSettingsMenuOpen(false)}
					/>
				)}
			</div>
		</div>
	) : null;

	if (view === "task" && currentTask) {
		const taskActions = {
			updateTaskStatus: (status: TaskStatus) =>
				updateTaskStatus(currentTask.id, status),
			updateTaskText: (text: string) => updateTaskText(currentTask.id, text),
			updateTaskDescription: (description: string) =>
				updateTaskDescription(currentTask.id, description),
			setTaskTags: (tagIds: string[]) => setTaskTags(currentTask.id, tagIds),
			deleteTask: () => deleteTask(currentTask.id),
			createSubtask: (text: string) => createSubtask(currentTask.id, text),
			updateSubtaskStatus: (subtaskId: string, status: SubtaskStatus) =>
				updateSubtaskStatus(currentTask.id, subtaskId, status),
			deleteSubtask: (subtaskId: string) =>
				deleteSubtask(currentTask.id, subtaskId),
			reorderSubtasks: (subtaskIds: string[]) =>
				reorderSubtasks(currentTask.id, subtaskIds),
			updateSubtaskText: (subtaskId: string, text: string) =>
				updateSubtaskText(currentTask.id, subtaskId, text),
			updateSubtaskCategory: (subtaskId: string, category: SubtaskCategory) =>
				updateSubtaskCategory(currentTask.id, subtaskId, category),
			updateSubtaskNotes: (subtaskId: string, notes: string) =>
				updateSubtaskNotes(currentTask.id, subtaskId, notes),
			updateSubtaskShouldCommit: (subtaskId: string, shouldCommit: boolean) =>
				updateSubtaskShouldCommit(currentTask.id, subtaskId, shouldCommit),
			createStep: (subtaskId: string, text: string) =>
				createStep(currentTask.id, subtaskId, text),
			toggleStep: (subtaskId: string, stepId: string) =>
				toggleStep(currentTask.id, subtaskId, stepId),
			deleteStep: (subtaskId: string, stepId: string) =>
				deleteStep(currentTask.id, subtaskId, stepId),
			updateStepText: (subtaskId: string, stepId: string, text: string) =>
				updateStepText(currentTask.id, subtaskId, stepId, text),
			executeSubtask: (subtaskId: string) =>
				executeSubtask(currentTask.id, subtaskId),
			abortExecution,
			startLoop: () => startLoop(currentTask.id),
			stopLoop,
			navigateBack: handleNavigateToList,
			generateSubtasks: (modelId: string) =>
				generateSubtasks(currentTask.id, modelId),
			openOpencodeTerminal: () => openOpencodeTerminal(currentTask.id),
		};

		return (
			<div className="flex h-full flex-col overflow-hidden">
				<Breadcrumb right={taskSettingsButton} />
				<TaskDetail
					task={currentTask}
					tags={tags}
					actions={taskActions}
					isExecuting={isExecuting}
					executingSubtaskId={executingSubtaskId}
					isLooping={isLooping}
					isTaskGenerating={isTaskGenerating}
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
				<TaskInputArea
					value={newTaskText}
					onChange={setNewTaskText}
					onCreateTask={createTask}
					onTagsClick={() => setIsManageTagsOpen(true)}
					tags={tags}
					selectedTagIds={selectedTagIds}
					onToggleTag={handleToggleTagSelection}
					folderId={currentFolderId ?? ""}
					folderWorkingDirectory={currentFolder?.workingDirectory ?? ""}
				/>
				<h2 className="text-[12px] font-medium text-white/40 tracking-wide">
					Tasks
				</h2>
				{filteredTasks.length === 0 ? (
					<TaskEmptyState hasFilter={selectedTagIds.length > 0} />
				) : (
					<div className="-mx-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
						{activeTasks.length > 0 && (
							<TaskList
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
								<h2 className="mt-4 text-[12px] font-medium text-white/40 tracking-wide">
									Completed
								</h2>
								<TaskList
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
				<RenameFolderModal
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
				<DeleteFolderModal
					folderName={currentFolder.name}
					taskCount={currentFolder.taskCount}
					tagCount={tags.length}
					onConfirm={handleConfirmDeleteFolder}
					onClose={() => setIsDeletingFolder(false)}
				/>
			)}

			{isManageTagsOpen && (
				<ManageTagsModal
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

export { TasksPlugin };
