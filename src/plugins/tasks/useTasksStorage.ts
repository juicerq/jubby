import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";
import { createTrace, tracedInvoke } from "@/lib/trace";
import type {
	ExecutionLog,
	ExecutionOutcome,
	Folder,
	Learnings,
	RecentTask,
	Step,
	Subtask,
	SubtaskCategory,
	SubtaskStatus,
	Tag,
	Task,
	TaskStatus,
} from "./types";

const PENDING_DELETE_TIMEOUT_MS = 1500;
const logger = createLogger("tasks");

interface ReloadOptions {
	forceReload?: boolean;
}

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

interface StepFromBackend {
	id: string;
	text: string;
	completed: boolean;
}

interface LearningsFromBackend {
	patterns: string[];
	gotchas: string[];
	context: string[];
}

interface ExecutionLogFromBackend {
	id: string;
	startedAt: number;
	completedAt: number | null;
	duration: number | null;
	outcome: string;
	summary: string;
	filesChanged: string[];
	learnings: LearningsFromBackend;
	committed: boolean;
	commitHash: string | null;
	commitMessage: string | null;
	errorMessage: string | null;
}

interface SubtaskFromBackend {
	id: string;
	text: string;
	status: string;
	order: number;
	category: string;
	steps: StepFromBackend[];
	shouldCommit: boolean;
	notes: string;
	executionLogs: ExecutionLogFromBackend[];
}

interface TaskFromBackend {
	id: string;
	text: string;
	status: string;
	createdAt: number;
	description: string;
	workingDirectory: string;
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

interface ExecutionResultFromBackend {
	sessionId: string;
	outcome: string;
	aborted: boolean;
	errorMessage: string | null;
}

interface GenerateSubtasksResultFromBackend {
	sessionId: string;
	message: string;
}

export interface GenerateSubtasksResult {
	sessionId: string;
	message: string;
}

interface UseTasksStorageReturn {
	tasks: Task[];
	tags: Tag[];
	isLoading: boolean;

	// Execution state
	isExecuting: boolean;
	executingSubtaskId: string | null;
	currentSessionId: string | null;
	isLooping: boolean;

	// Reload function for watcher
	reloadTasks: (options?: ReloadOptions) => Promise<void>;

	createTask: (text: string, tagIds?: string[]) => Promise<void>;
	updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
	updateTaskText: (id: string, text: string) => Promise<void>;
	updateTaskDescription: (id: string, description: string) => Promise<void>;
	updateTaskWorkingDirectory: (id: string, path: string) => Promise<void>;
	deleteTask: (id: string) => Promise<void>;
	setTaskTags: (taskId: string, tagIds: string[]) => Promise<void>;

	createTag: (name: string, color: string) => Promise<boolean>;
	updateTag: (id: string, name: string, color: string) => Promise<boolean>;
	deleteTag: (id: string) => Promise<void>;

	createSubtask: (taskId: string, text: string) => Promise<void>;
	updateSubtaskStatus: (
		taskId: string,
		subtaskId: string,
		status: SubtaskStatus,
	) => Promise<void>;
	updateSubtaskOrder: (
		taskId: string,
		subtaskId: string,
		order: number,
	) => Promise<void>;
	updateSubtaskCategory: (
		taskId: string,
		subtaskId: string,
		category: SubtaskCategory,
	) => Promise<void>;
	updateSubtaskNotes: (
		taskId: string,
		subtaskId: string,
		notes: string,
	) => Promise<void>;
	updateSubtaskShouldCommit: (
		taskId: string,
		subtaskId: string,
		shouldCommit: boolean,
	) => Promise<void>;
	deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
	reorderSubtasks: (taskId: string, subtaskIds: string[]) => Promise<void>;
	updateSubtaskText: (
		taskId: string,
		subtaskId: string,
		text: string,
	) => Promise<void>;

	createStep: (
		taskId: string,
		subtaskId: string,
		text: string,
	) => Promise<void>;
	toggleStep: (
		taskId: string,
		subtaskId: string,
		stepId: string,
	) => Promise<void>;
	deleteStep: (
		taskId: string,
		subtaskId: string,
		stepId: string,
	) => Promise<void>;
	updateStepText: (
		taskId: string,
		subtaskId: string,
		stepId: string,
		text: string,
	) => Promise<void>;

	createExecutionLog: (
		taskId: string,
		subtaskId: string,
		log: Omit<ExecutionLog, "id">,
	) => Promise<void>;

	// Execution functions
	ensureOpenCodeServer: () => Promise<boolean>;
	executeSubtask: (
		taskId: string,
		subtaskId: string,
	) => Promise<ExecutionResultFromBackend | null>;
	abortExecution: () => Promise<void>;

	// Loop functions
	startLoop: (taskId: string) => Promise<void>;
	stopLoop: () => void;

	// Generate subtasks
	generateSubtasks: (taskId: string) => Promise<GenerateSubtasksResult | null>;
	isGenerating: boolean;
}

interface UseFolderStorageReturn {
	folders: Folder[];
	isLoading: boolean;

	loadFolders: (options?: ReloadOptions) => Promise<void>;
	createFolder: (name: string) => Promise<Folder | null>;
	renameFolder: (id: string, name: string) => Promise<boolean>;
	deleteFolder: (id: string) => Promise<boolean>;
	reorderFolders: (folderIds: string[]) => Promise<void>;
}

function mapBackendStep(step: StepFromBackend): Step {
	return {
		id: step.id,
		text: step.text,
		completed: step.completed,
	};
}

function mapBackendLearnings(learnings: LearningsFromBackend): Learnings {
	return {
		patterns: learnings.patterns ?? [],
		gotchas: learnings.gotchas ?? [],
		context: learnings.context ?? [],
	};
}

function mapBackendExecutionLog(log: ExecutionLogFromBackend): ExecutionLog {
	return {
		id: log.id,
		startedAt: log.startedAt,
		completedAt: log.completedAt,
		duration: log.duration,
		outcome: log.outcome as ExecutionOutcome,
		summary: log.summary,
		filesChanged: log.filesChanged ?? [],
		learnings: mapBackendLearnings(log.learnings),
		committed: log.committed,
		commitHash: log.commitHash,
		commitMessage: log.commitMessage,
		errorMessage: log.errorMessage,
	};
}

function mapBackendSubtask(subtask: SubtaskFromBackend): Subtask {
	return {
		id: subtask.id,
		text: subtask.text,
		status: subtask.status as SubtaskStatus,
		order: subtask.order,
		category: subtask.category as SubtaskCategory,
		steps: subtask.steps.map(mapBackendStep),
		shouldCommit: subtask.shouldCommit,
		notes: subtask.notes,
		executionLogs: subtask.executionLogs.map(mapBackendExecutionLog),
	};
}

function mapBackendTask(task: TaskFromBackend): Task {
	return {
		id: task.id,
		text: task.text,
		status: task.status as TaskStatus,
		createdAt: task.createdAt,
		description: task.description ?? "",
		workingDirectory: task.workingDirectory ?? "",
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

function createDefaultSubtask(
	id: string,
	text: string,
	order: number,
): Subtask {
	return {
		id,
		text,
		status: "waiting",
		order,
		category: "functional",
		steps: [],
		shouldCommit: true,
		notes: "",
		executionLogs: [],
	};
}

function createDefaultTask(
	id: string,
	text: string,
	tagIds: string[],
	description?: string,
	workingDirectory?: string,
): Task {
	return {
		id,
		text,
		status: "pending",
		createdAt: Date.now(),
		description: description ?? "",
		workingDirectory: workingDirectory ?? "",
		tagIds,
		subtasks: [],
	};
}

export function useTasksStorage(folderId: string): UseTasksStorageReturn {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [tags, setTags] = useState<Tag[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const [isExecuting, setIsExecuting] = useState(false);
	const [executingSubtaskId, setExecutingSubtaskId] = useState<string | null>(
		null,
	);
	const currentSessionIdRef = useRef<string | null>(null);

	const [isLooping, setIsLooping] = useState(false);
	const loopAbortedRef = useRef(false);
	const [isGenerating, setIsGenerating] = useState(false);

	const fetchTasks = useCallback(
		async (options?: ReloadOptions) => {
			if (!folderId) {
				setTasks([]);
				setTags([]);
				return;
			}
			const data = await invoke<TasksDataFromBackend>("tasks_get_by_folder", {
				folderId,
				forceReload: options?.forceReload,
			});
			setTasks(data.tasks.map(mapBackendTask));
			setTags(data.tags);
		},
		[folderId],
	);

	const reloadTasks = useCallback(
		async (options?: ReloadOptions) => {
			try {
				await fetchTasks(options);
			} catch (error) {
				console.error("Failed to reload tasks data:", error);
			}
		},
		[fetchTasks],
	);

	useEffect(() => {
		const loadData = async () => {
			try {
				await fetchTasks({ forceReload: true });
			} catch (error) {
				console.error("Failed to load tasks data:", error);
				toast.error("Failed to load data");
			} finally {
				setIsLoading(false);
			}
		};

		loadData();
	}, [fetchTasks]);

	const createTask = useCallback(
		async (
			text: string,
			tagIds?: string[],
			description?: string,
			workingDirectory?: string,
		) => {
			const tempId = `temp-${Date.now()}`;
			const optimisticTask = createDefaultTask(
				tempId,
				text,
				tagIds ?? [],
				description,
				workingDirectory,
			);

			setTasks((prev) => [optimisticTask, ...prev]);

			try {
				const newTask = await invoke<TaskFromBackend>("tasks_create", {
					folderId,
					text,
					tagIds: tagIds ?? null,
					description: description ?? null,
					workingDirectory: workingDirectory ?? null,
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

	const updateTaskText = useCallback(async (id: string, text: string) => {
		let previousTasks: Task[] = [];

		setTasks((prev) => {
			previousTasks = prev;
			return prev.map((t) => (t.id === id ? { ...t, text } : t));
		});

		try {
			await invoke("tasks_update_text", { id, text });
		} catch (error) {
			setTasks(previousTasks);
			toast.error("Failed to update task");
		}
	}, []);

	const updateTaskDescription = useCallback(
		async (id: string, description: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) => (t.id === id ? { ...t, description } : t));
			});

			try {
				await invoke("tasks_update_description", { id, description });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update description");
			}
		},
		[],
	);

	const updateTaskWorkingDirectory = useCallback(
		async (id: string, path: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === id ? { ...t, workingDirectory: path } : t,
				);
			});

			try {
				await invoke("tasks_update_working_directory", {
					id,
					workingDirectory: path,
				});
			} catch (error) {
				logger.error("Failed to update working directory", {
					taskId: id,
					path,
					error: String(error),
				});
				setTasks(previousTasks);
				toast.error("Failed to update working directory");
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
			const maxOrder =
				task?.subtasks.reduce((max, s) => Math.max(max, s.order), -1) ?? -1;

			const optimisticSubtask = createDefaultSubtask(
				tempId,
				text,
				maxOrder + 1,
			);

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

	const updateSubtaskStatus = useCallback(
		async (taskId: string, subtaskId: string, status: SubtaskStatus) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId ? { ...s, status } : s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("subtasks_update_status", { taskId, subtaskId, status });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update subtask status");
			}
		},
		[],
	);

	const updateSubtaskOrder = useCallback(
		async (taskId: string, subtaskId: string, order: number) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId ? { ...s, order } : s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("subtasks_update_order", { taskId, subtaskId, order });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update subtask order");
			}
		},
		[],
	);

	const updateSubtaskCategory = useCallback(
		async (taskId: string, subtaskId: string, category: SubtaskCategory) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId ? { ...s, category } : s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("subtasks_update_category", {
					taskId,
					subtaskId,
					category,
				});
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update subtask category");
			}
		},
		[],
	);

	const updateSubtaskNotes = useCallback(
		async (taskId: string, subtaskId: string, notes: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId ? { ...s, notes } : s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("subtasks_update_notes", { taskId, subtaskId, notes });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update subtask notes");
			}
		},
		[],
	);

	const updateSubtaskShouldCommit = useCallback(
		async (taskId: string, subtaskId: string, shouldCommit: boolean) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId ? { ...s, shouldCommit } : s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("subtasks_update_should_commit", {
					taskId,
					subtaskId,
					shouldCommit,
				});
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update subtask commit setting");
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
					const reorderedSubtasks = subtaskIds
						.map((id, index) => {
							const subtask = subtaskMap.get(id);
							return subtask ? { ...subtask, order: index } : null;
						})
						.filter((s): s is Subtask => s !== null);
					return { ...t, subtasks: reorderedSubtasks };
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

	const createStep = useCallback(
		async (taskId: string, subtaskId: string, text: string) => {
			const tempId = `temp-${Date.now()}`;
			const optimisticStep: Step = { id: tempId, text, completed: false };

			setTasks((prev) =>
				prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId
										? { ...s, steps: [...s.steps, optimisticStep] }
										: s,
								),
							}
						: t,
				),
			);

			try {
				const newStep = await invoke<StepFromBackend>("steps_create", {
					taskId,
					subtaskId,
					text,
				});
				setTasks((prev) =>
					prev.map((t) =>
						t.id === taskId
							? {
									...t,
									subtasks: t.subtasks.map((s) =>
										s.id === subtaskId
											? {
													...s,
													steps: s.steps.map((step) =>
														step.id === tempId ? mapBackendStep(newStep) : step,
													),
												}
											: s,
									),
								}
							: t,
					),
				);
			} catch (error) {
				setTasks((prev) =>
					prev.map((t) =>
						t.id === taskId
							? {
									...t,
									subtasks: t.subtasks.map((s) =>
										s.id === subtaskId
											? {
													...s,
													steps: s.steps.filter((step) => step.id !== tempId),
												}
											: s,
									),
								}
							: t,
					),
				);
				toast.error("Failed to create step");
			}
		},
		[],
	);

	const toggleStep = useCallback(
		async (taskId: string, subtaskId: string, stepId: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId
										? {
												...s,
												steps: s.steps.map((step) =>
													step.id === stepId
														? { ...step, completed: !step.completed }
														: step,
												),
											}
										: s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("steps_toggle", { taskId, subtaskId, stepId });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to toggle step");
			}
		},
		[],
	);

	const deleteStep = useCallback(
		async (taskId: string, subtaskId: string, stepId: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId
										? {
												...s,
												steps: s.steps.filter((step) => step.id !== stepId),
											}
										: s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("steps_delete", { taskId, subtaskId, stepId });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to delete step");
			}
		},
		[],
	);

	const updateStepText = useCallback(
		async (taskId: string, subtaskId: string, stepId: string, text: string) => {
			let previousTasks: Task[] = [];

			setTasks((prev) => {
				previousTasks = prev;
				return prev.map((t) =>
					t.id === taskId
						? {
								...t,
								subtasks: t.subtasks.map((s) =>
									s.id === subtaskId
										? {
												...s,
												steps: s.steps.map((step) =>
													step.id === stepId ? { ...step, text } : step,
												),
											}
										: s,
								),
							}
						: t,
				);
			});

			try {
				await invoke("steps_update_text", { taskId, subtaskId, stepId, text });
			} catch (error) {
				setTasks(previousTasks);
				toast.error("Failed to update step text");
			}
		},
		[],
	);

	const createExecutionLog = useCallback(
		async (
			taskId: string,
			subtaskId: string,
			log: Omit<ExecutionLog, "id">,
		) => {
			try {
				const newLog = await invoke<ExecutionLogFromBackend>(
					"execution_logs_create",
					{
						taskId,
						subtaskId,
						startedAt: log.startedAt,
						completedAt: log.completedAt,
						duration: log.duration,
						outcome: log.outcome,
						summary: log.summary,
						filesChanged: log.filesChanged,
						patterns: log.learnings.patterns,
						gotchas: log.learnings.gotchas,
						context: log.learnings.context,
						committed: log.committed,
						commitHash: log.commitHash,
						commitMessage: log.commitMessage,
						errorMessage: log.errorMessage,
					},
				);
				setTasks((prev) =>
					prev.map((t) =>
						t.id === taskId
							? {
									...t,
									subtasks: t.subtasks.map((s) =>
										s.id === subtaskId
											? {
													...s,
													executionLogs: [
														...s.executionLogs,
														mapBackendExecutionLog(newLog),
													],
												}
											: s,
									),
								}
							: t,
					),
				);
			} catch (error) {
				toast.error("Failed to create execution log");
			}
		},
		[],
	);

	const ensureOpenCodeServer = useCallback(async (): Promise<boolean> => {
		try {
			await invoke("opencode_ensure_server");
			return true;
		} catch (error) {
			console.error("Failed to ensure OpenCode server:", error);
			toast.error("Failed to start OpenCode server");
			return false;
		}
	}, []);

	const executeSubtask = useCallback(
		async (
			taskId: string,
			subtaskId: string,
		): Promise<ExecutionResultFromBackend | null> => {
			if (isExecuting) {
				toast.error("Another subtask is already executing");
				return null;
			}

			const trace = createTrace({
				plugin: "tasks",
				action: "execute_subtask",
				taskId,
				subtaskId,
			});

			setIsExecuting(true);
			setExecutingSubtaskId(subtaskId);

			try {
				trace.info("Starting subtask execution");
				const result = await tracedInvoke<ExecutionResultFromBackend>(
					"tasks_execute_subtask",
					{ taskId, subtaskId },
					trace,
				);
				currentSessionIdRef.current = result.sessionId;
				trace.info(`Execution completed: ${result.outcome}`);
				return result;
			} catch (error) {
				const message =
					typeof error === "string" ? error : "Failed to execute subtask";
				trace.error("Subtask execution failed", {
					message,
					code: "EXECUTE_SUBTASK_FAILED",
				});
				toast.error(message);
				return null;
			} finally {
				setIsExecuting(false);
				setExecutingSubtaskId(null);
				currentSessionIdRef.current = null;
				trace.end();
			}
		},
		[isExecuting],
	);

	const abortExecution = useCallback(async (): Promise<void> => {
		const sessionId = currentSessionIdRef.current;
		if (!sessionId) {
			return;
		}

		try {
			await invoke("opencode_abort_session", { sessionId });
		} catch (error) {
			console.error("Failed to abort execution:", error);
			toast.error("Failed to abort execution");
		}
	}, []);

	const stopLoop = useCallback(() => {
		loopAbortedRef.current = true;
		setIsLooping(false);
	}, []);

	const startLoop = useCallback(
		async (taskId: string): Promise<void> => {
			if (isExecuting || isLooping) {
				return;
			}

			const task = tasks.find((t) => t.id === taskId);
			if (!task) {
				toast.error("Task not found");
				return;
			}

			const trace = createTrace({
				plugin: "tasks",
				action: "start_loop",
				taskId,
			});

			setIsLooping(true);
			loopAbortedRef.current = false;

			const sortedSubtasks = [...task.subtasks].sort(
				(a, b) => a.order - b.order,
			);

			const pendingSubtasks = sortedSubtasks.filter(
				(s) => s.status === "waiting" || s.status === "failed",
			);
			trace.info(
				`Starting loop with ${pendingSubtasks.length} pending subtasks`,
			);

			let completedCount = 0;
			let failedCount = 0;

			for (const subtask of sortedSubtasks) {
				if (loopAbortedRef.current) {
					trace.info("Loop aborted by user");
					break;
				}

				if (subtask.status === "waiting" || subtask.status === "failed") {
					setIsExecuting(true);
					setExecutingSubtaskId(subtask.id);

					trace.info(`Executing subtask: ${subtask.text}`);

					try {
						const result = await tracedInvoke<ExecutionResultFromBackend>(
							"tasks_execute_subtask",
							{ taskId, subtaskId: subtask.id },
							trace,
						);
						currentSessionIdRef.current = result.sessionId;

						if (result.outcome === "success") {
							completedCount++;
						} else {
							failedCount++;
						}

						trace.info(`Subtask completed: ${result.outcome}`);
					} catch (error) {
						const message =
							typeof error === "string" ? error : "Failed to execute subtask";
						trace.error("Subtask execution failed in loop", {
							message,
							code: "LOOP_SUBTASK_FAILED",
						});
						toast.error(message);
						failedCount++;
						break;
					} finally {
						setIsExecuting(false);
						setExecutingSubtaskId(null);
						currentSessionIdRef.current = null;
					}
				}
			}

			trace.info(
				`Loop finished: ${completedCount} completed, ${failedCount} failed`,
			);
			trace.end();

			setIsLooping(false);
			loopAbortedRef.current = false;
		},
		[isExecuting, isLooping, tasks],
	);

	const generateSubtasks = useCallback(
		async (taskId: string): Promise<GenerateSubtasksResult | null> => {
			if (isGenerating) {
				toast.error("Generation already in progress");
				return null;
			}

			const trace = createTrace({
				plugin: "tasks",
				action: "generate_subtasks",
				taskId,
			});

			setIsGenerating(true);

			try {
				trace.info("Starting subtask generation");
				const result = await tracedInvoke<GenerateSubtasksResultFromBackend>(
					"tasks_generate_subtasks",
					{ taskId },
					trace,
				);

				trace.info("Generation completed, reloading task data");

				// Reload task data since AI edited tasks.json directly
				await fetchTasks({ forceReload: true });

				trace.info("Subtasks generated successfully");
				toast.success("Subtasks generated successfully");

				return {
					sessionId: result.sessionId,
					message: result.message,
				};
			} catch (error) {
				const errorMsg = String(error);
				if (errorMsg.includes("description is empty")) {
					trace.error("Generation failed - description empty", {
						message: errorMsg,
						code: "DESCRIPTION_EMPTY",
					});
					toast.error("Please add a description to the task first");
				} else {
					trace.error("Generation failed", {
						message: errorMsg,
						code: "GENERATE_SUBTASKS_FAILED",
					});
					toast.error("Failed to generate subtasks");
				}
				return null;
			} finally {
				setIsGenerating(false);
				trace.end();
			}
		},
		[fetchTasks, isGenerating],
	);

	return {
		tasks,
		tags,
		isLoading,
		isExecuting,
		executingSubtaskId,
		currentSessionId: currentSessionIdRef.current,
		isLooping,
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
		updateSubtaskOrder,
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
		createExecutionLog,
		ensureOpenCodeServer,
		executeSubtask,
		abortExecution,
		startLoop,
		stopLoop,
		generateSubtasks,
		isGenerating,
	};
}

type ServerStatus = "idle" | "starting" | "ready" | "error";

interface UseOpenCodeServerReturn {
	status: ServerStatus;
	error: string | null;
	isReady: boolean;
	startServer: () => Promise<boolean>;
	checkHealth: () => Promise<boolean>;
}

const HEALTH_CHECK_INTERVAL_MS = 30_000;

export function useOpenCodeServer(): UseOpenCodeServerReturn {
	const [status, setStatus] = useState<ServerStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const restartAttemptedRef = useRef(false);
	const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	const checkHealth = useCallback(async (): Promise<boolean> => {
		try {
			const result = await invoke<{ healthy: boolean; version: string }>(
				"opencode_health_check",
			);
			return result.healthy;
		} catch {
			return false;
		}
	}, []);

	const startServer = useCallback(async (): Promise<boolean> => {
		if (status === "starting") return false;

		setStatus("starting");
		setError(null);

		try {
			await invoke("opencode_ensure_server");
			setStatus("ready");
			restartAttemptedRef.current = false;
			return true;
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			setError(errorMsg);
			setStatus("error");
			return false;
		}
	}, [status]);

	const handleHealthCheckFailure = useCallback(async () => {
		if (status !== "ready") return;

		if (!restartAttemptedRef.current) {
			restartAttemptedRef.current = true;
			console.warn(
				"[OpenCode] Server health check failed, attempting restart...",
			);
			const success = await startServer();
			if (!success) {
				toast.error("OpenCode server crashed and could not be restarted", {
					action: {
						label: "Retry",
						onClick: () => {
							restartAttemptedRef.current = false;
							startServer();
						},
					},
				});
			}
		} else {
			setStatus("error");
			setError("Server crashed and restart failed");
			toast.error("OpenCode server is not responding", {
				action: {
					label: "Retry",
					onClick: () => {
						restartAttemptedRef.current = false;
						startServer();
					},
				},
			});
		}
	}, [status, startServer]);

	useEffect(() => {
		if (status !== "ready") {
			if (healthCheckIntervalRef.current) {
				clearInterval(healthCheckIntervalRef.current);
				healthCheckIntervalRef.current = null;
			}
			return;
		}

		healthCheckIntervalRef.current = setInterval(async () => {
			const healthy = await checkHealth();
			if (!healthy) {
				handleHealthCheckFailure();
			}
		}, HEALTH_CHECK_INTERVAL_MS);

		return () => {
			if (healthCheckIntervalRef.current) {
				clearInterval(healthCheckIntervalRef.current);
				healthCheckIntervalRef.current = null;
			}
		};
	}, [status, checkHealth, handleHealthCheckFailure]);

	return {
		status,
		error,
		isReady: status === "ready",
		startServer,
		checkHealth,
	};
}

export function useFolderStorage(): UseFolderStorageReturn {
	const [folders, setFolders] = useState<Folder[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const loadFolders = useCallback(async (options?: ReloadOptions) => {
		const trace = createTrace({ plugin: "tasks", action: "load_folders" });
		trace.info("Loading folders");

		try {
			const data = await tracedInvoke<FolderFromBackend[]>(
				"folder_get_all",
				{
					forceReload: options?.forceReload,
				},
				trace,
			);
			trace.info(`Loaded ${data.length} folders`);
			setFolders(data.map(mapBackendFolder));
		} catch (error) {
			console.error("Failed to load folders:", error);
			trace.error("Failed to load folders", {
				message: String(error),
				code: "LOAD_FOLDERS_FAILED",
			});
			toast.error("Failed to load folders");
		} finally {
			setIsLoading(false);
			trace.end();
		}
	}, []);

	useEffect(() => {
		loadFolders({ forceReload: true });
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
