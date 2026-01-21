import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
	Folder,
	RecentTask,
	Subtask,
	Tag,
	Task,
	TaskStatus,
} from "./types";

const PENDING_DELETE_TIMEOUT_MS = 1500;

interface UsePendingDeleteReturn {
	pendingId: string | null;
	handleDeleteClick: (id: string) => void;
	cancelDelete: () => void;
}

/**
 * Hook for two-step delete confirmation pattern.
 * First click shows confirmation state, second click executes delete.
 * Auto-cancels after timeout.
 */
export function usePendingDelete(
	onConfirmDelete: (id: string) => void,
): UsePendingDeleteReturn {
	const [pendingId, setPendingId] = useState<string | null>(null);

	useEffect(() => {
		if (pendingId === null) return;

		const timeout = setTimeout(() => {
			setPendingId(null);
		}, PENDING_DELETE_TIMEOUT_MS);

		return () => clearTimeout(timeout);
	}, [pendingId]);

	const handleDeleteClick = useCallback(
		(id: string) => {
			if (pendingId === id) {
				onConfirmDelete(id);
				setPendingId(null);
			} else {
				setPendingId(id);
			}
		},
		[pendingId, onConfirmDelete],
	);

	const cancelDelete = useCallback(() => {
		setPendingId(null);
	}, []);

	return { pendingId, handleDeleteClick, cancelDelete };
}

interface SubtaskFromBackend {
	id: string;
	text: string;
	completed: boolean;
	position: number;
}

interface TaskFromBackend {
	id: string;
	text: string;
	status: string;
	createdAt: number;
	tagIds: string[];
	subtasks: SubtaskFromBackend[];
}

interface TasksDataFromBackend {
	tasks: TaskFromBackend[];
	tags: Tag[];
}

interface FolderFromBackend {
	id: string;
	name: string;
	position: number;
	createdAt: number;
	taskCount: number;
	recentTasks: RecentTask[];
}

interface UseTasksStorageReturn {
	tasks: Task[];
	tags: Tag[];
	isLoading: boolean;

	createTask: (text: string, tagIds?: string[]) => Promise<void>;
	updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
	deleteTask: (id: string) => Promise<void>;
	setTaskTags: (taskId: string, tagIds: string[]) => Promise<void>;

	createTag: (name: string, color: string) => Promise<boolean>;
	updateTag: (id: string, name: string, color: string) => Promise<boolean>;
	deleteTag: (id: string) => Promise<void>;

	createSubtask: (taskId: string, text: string) => Promise<void>;
	toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	reorderSubtasks: (taskId: string, subtaskIds: string[]) => Promise<void>;
	updateSubtaskText: (
		taskId: string,
		subtaskId: string,
		text: string,
	) => Promise<void>;
}

interface UseFolderStorageReturn {
	folders: Folder[];
	isLoading: boolean;

	loadFolders: () => Promise<void>;
	createFolder: (name: string) => Promise<Folder | null>;
	renameFolder: (id: string, name: string) => Promise<boolean>;
	deleteFolder: (id: string) => Promise<boolean>;
	reorderFolders: (folderIds: string[]) => Promise<void>;
}

function mapBackendSubtask(subtask: SubtaskFromBackend): Subtask {
	return {
		id: subtask.id,
		text: subtask.text,
		completed: subtask.completed,
		position: subtask.position,
	};
}

function mapBackendTask(task: TaskFromBackend): Task {
	return {
		id: task.id,
		text: task.text,
		status: task.status as TaskStatus,
		createdAt: task.createdAt,
		tagIds: task.tagIds,
		subtasks: task.subtasks.map(mapBackendSubtask),
	};
}

function mapBackendFolder(folder: FolderFromBackend): Folder {
	return {
		id: folder.id,
		name: folder.name,
		position: folder.position,
		createdAt: folder.createdAt,
		taskCount: folder.taskCount,
		recentTasks: folder.recentTasks,
	};
}

export function useTasksStorage(folderId: string): UseTasksStorageReturn {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [tags, setTags] = useState<Tag[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const loadData = async () => {
			try {
				const data = await invoke<TasksDataFromBackend>("tasks_get_by_folder", {
					folderId,
				});
				setTasks(data.tasks.map(mapBackendTask));
				setTags(data.tags);
			} catch (error) {
				console.error("Failed to load tasks data:", error);
				toast.error("Failed to load data");
			} finally {
				setIsLoading(false);
			}
		};

		loadData();
	}, [folderId]);

	const createTask = useCallback(
		async (text: string, tagIds?: string[]) => {
			const tempId = `temp-${Date.now()}`;
			const optimisticTask: Task = {
				id: tempId,
				text,
				status: "pending",
				createdAt: Date.now(),
				tagIds: tagIds ?? [],
				subtasks: [],
			};

			setTasks((prev) => [optimisticTask, ...prev]);

			try {
				const newTask = await invoke<TaskFromBackend>("tasks_create", {
					folderId,
					text,
					tagIds: tagIds ?? null,
				});
				setTasks((prev) =>
					prev.map((t) => (t.id === tempId ? mapBackendTask(newTask) : t)),
				);
			} catch (error) {
				setTasks((prev) => prev.filter((t) => t.id !== tempId));
				toast.error("Failed to create task");
			}
		},
		[folderId],
	);

	const updateTaskStatus = useCallback(
		async (id: string, status: TaskStatus) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) => (t.id === id ? { ...t, status } : t));
			});

			try {
				await invoke("tasks_update_status", { id, status });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update task");
			}
		},
		[],
	);

	const deleteTask = useCallback(async (id: string) => {
		let previousTasks: Task[] = [];

		setTasks((prev) => {
			previousTasks = prev;
			return prev.filter((t) => t.id !== id);
		});

		try {
			await invoke("tasks_delete", { id });
		} catch (error) {
			setTasks(previousTasks);
			toast.error("Failed to delete task");
		}
	}, []);

	const setTaskTags = useCallback(async (taskId: string, tagIds: string[]) => {
		let previousTasks: Task[] = [];

		setTasks((prev) => {
			previousTasks = prev;
			return prev.map((t) => (t.id === taskId ? { ...t, tagIds } : t));
		});

		try {
			await invoke("tasks_set_tags", { taskId, tagIds });
		} catch (error) {
			setTasks(previousTasks);
			toast.error("Failed to update tags");
		}
	}, []);

	const createTag = useCallback(
		async (name: string, color: string) => {
			const tempId = `temp-${Date.now()}`;
			const optimisticTag: Tag = { id: tempId, name, color };

			setTags((prev) => [...prev, optimisticTag]);

			try {
				const newTag = await invoke<Tag>("tag_create", {
					folderId,
					name,
					color,
				});
				setTags((prev) => prev.map((t) => (t.id === tempId ? newTag : t)));
				return true;
			} catch (error) {
				setTags((prev) => prev.filter((t) => t.id !== tempId));
				const errorMsg = String(error);
				if (errorMsg.includes("already exists")) {
					return false;
				}
				toast.error("Failed to create tag");
				return false;
			}
		},
		[folderId],
	);

	const updateTag = useCallback(
		async (id: string, name: string, color: string) => {
			let previousTags: Tag[] = [];

			setTags((prev) => {
				previousTags = prev;
				return prev.map((t) => (t.id === id ? { ...t, name, color } : t));
			});

			try {
				await invoke("tag_update", { id, name, color });
				return true;
			} catch (error) {
				setTags(previousTags);
				const errorMsg = String(error);
				if (errorMsg.includes("already exists")) {
					return false;
				}
				toast.error("Failed to update tag");
				return false;
			}
		},
		[],
	);

	const deleteTag = useCallback(async (id: string) => {
		let previousTags: Tag[] = [];
		let previousTasks: Task[] = [];

		setTags((prev) => {
			previousTags = prev;
			return prev.filter((t) => t.id !== id);
		});
		setTasks((prev) => {
			previousTasks = prev;
			return prev.map((t) => ({
				...t,
				tagIds: t.tagIds?.filter((tagId: string) => tagId !== id),
			}));
		});

		try {
			await invoke("tag_delete", { id });
		} catch (error) {
			setTags(previousTags);
			setTasks(previousTasks);
			toast.error("Failed to delete tag");
		}
	}, []);

	const createSubtask = useCallback(
		async (taskId: string, text: string) => {
			const tempId = `temp-${Date.now()}`;
			const task = tasks.find((t) => t.id === taskId);
			const maxPosition =
				task?.subtasks.reduce((max, s) => Math.max(max, s.position), -1) ?? -1;

			const optimisticSubtask: Subtask = {
				id: tempId,
				text,
				completed: false,
				position: maxPosition + 1,
			};

			setTasks((prev) =>
				prev.map((t) =>
					t.id === taskId
						? { ...t, subtasks: [...t.subtasks, optimisticSubtask] }
						: t,
				),
			);

			try {
				const newSubtask = await invoke<SubtaskFromBackend>("subtasks_create", {
					taskId,
					text,
				});
				setTasks((prev) =>
					prev.map((t) =>
						t.id === taskId
							? {
									...t,
									subtasks: t.subtasks.map((s) =>
										s.id === tempId ? mapBackendSubtask(newSubtask) : s,
									),
								}
							: t,
					),
				);
			} catch (error) {
				setTasks((prev) =>
					prev.map((t) =>
						t.id === taskId
							? { ...t, subtasks: t.subtasks.filter((s) => s.id !== tempId) }
							: t,
					),
				);
				toast.error("Failed to create subtask");
			}
		},
		[tasks],
	);

	const toggleSubtask = useCallback(
		async (taskId: string, subtaskId: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId ? { ...s, completed: !s.completed } : s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("subtasks_toggle", { taskId, subtaskId });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to toggle subtask");
			}
		},
		[],
	);

	const deleteSubtask = useCallback(
		async (taskId: string, subtaskId: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }
						: t,
				);
			});

			try {
				await invoke("subtasks_delete", { taskId, subtaskId });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to delete subtask");
			}
		},
		[],
	);

	const reorderSubtasks = useCallback(
		async (taskId: string, subtaskIds: string[]) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) => {
					if (t.id !== taskId) return t;
					const subtaskMap = new Map(t.subtasks.map((s) => [s.id, s]));
					return {
						...t,
						subtasks: subtaskIds
							.map((id, index) => {
								const subtask = subtaskMap.get(id);
								return subtask ? { ...subtask, position: index } : null;
							})
							.filter((s): s is Subtask => s !== null),
					};
				});
			});

			try {
				await invoke("subtasks_reorder", { taskId, subtaskIds });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to reorder subtasks");
			}
		},
		[],
	);

	const updateSubtaskText = useCallback(
		async (taskId: string, subtaskId: string, text: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId ? { ...s, text } : s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("subtasks_update_text", { taskId, subtaskId, text });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update subtask");
			}
		},
		[],
	);

	return {
		tasks,
		tags,
		isLoading,
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
		updateSubtaskText,
	};
}

export function useFolderStorage(): UseFolderStorageReturn {
	const [folders, setFolders] = useState<Folder[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const loadFolders = useCallback(async () => {
		try {
			const data = await invoke<FolderFromBackend[]>("folder_get_all");
			setFolders(data.map(mapBackendFolder));
		} catch (error) {
			console.error("Failed to load folders:", error);
			toast.error("Failed to load folders");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadFolders();
	}, [loadFolders]);

	const createFolder = useCallback(
		async (name: string) => {
			const tempId = `temp-${Date.now()}`;
			const optimisticFolder: Folder = {
				id: tempId,
				name,
				position: folders.length,
				createdAt: Date.now(),
				taskCount: 0,
				recentTasks: [],
			};

			setFolders((prev) => [...prev, optimisticFolder]);

			try {
				const newFolder = await invoke<FolderFromBackend>("folder_create", {
					name,
				});
				const mappedFolder = mapBackendFolder(newFolder);
				setFolders((prev) =>
					prev.map((f) =>
						f.id === tempId
							? { ...mappedFolder, taskCount: 0, recentTasks: [] }
							: f,
					),
				);
				return mappedFolder;
			} catch (error) {
				setFolders((prev) => prev.filter((f) => f.id !== tempId));
				toast.error("Failed to create folder");
				return null;
			}
		},
		[folders.length],
	);

	const renameFolder = useCallback(async (id: string, name: string) => {
		let previousFolders: Folder[] = [];

		setFolders((prev) => {
			previousFolders = prev;
			return prev.map((f) => (f.id === id ? { ...f, name } : f));
		});

		try {
			await invoke("folder_rename", { id, name });
			return true;
		} catch (error) {
			setFolders(previousFolders);
			toast.error("Failed to rename folder");
			return false;
		}
	}, []);

	const deleteFolder = useCallback(async (id: string) => {
		let previousFolders: Folder[] = [];

		setFolders((prev) => {
			previousFolders = prev;
			return prev.filter((f) => f.id !== id);
		});

		try {
			await invoke("folder_delete", { id });
			return true;
		} catch (error) {
			setFolders(previousFolders);
			toast.error("Failed to delete folder");
			return false;
		}
	}, []);

	const reorderFolders = useCallback(async (folderIds: string[]) => {
		let previousFolders: Folder[] = [];

		// Reorder folders based on the new ID order
		setFolders((prev) => {
			previousFolders = prev;
			const folderMap = new Map(prev.map((f) => [f.id, f]));
			return folderIds
				.map((id, index) => {
					const folder = folderMap.get(id);
					return folder ? { ...folder, position: index } : null;
				})
				.filter((f): f is Folder => f !== null);
		});

		try {
			await invoke("folder_reorder", { folderIds });
		} catch (error) {
			setFolders(previousFolders);
			toast.error("Failed to reorder folders");
		}
	}, []);

	return {
		folders,
		isLoading,
		loadFolders,
		createFolder,
		renameFolder,
		deleteFolder,
		reorderFolders,
	};
}
