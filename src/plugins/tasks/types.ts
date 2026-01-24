export interface Tag {
	id: string;
	name: string;
	color: string;
}

export type TaskStatus = "pending" | "in_progress" | "completed";

export type SubtaskStatus = "waiting" | "in_progress" | "completed" | "failed";

export type SubtaskCategory =
	| "functional"
	| "test"
	| "types"
	| "fix"
	| "refactor"
	| "cleanup"
	| "docs";

export type ExecutionOutcome = "success" | "partial" | "failed" | "aborted";

export interface Step {
	id: string;
	text: string;
	completed: boolean;
}

export interface Learnings {
	patterns: string[];
	gotchas: string[];
	context: string[];
}

export interface ExecutionLog {
	id: string;
	startedAt: number;
	completedAt: number | null;
	duration: number | null;
	outcome: ExecutionOutcome;
	summary: string;
	filesChanged: string[];
	learnings: Learnings;
	committed: boolean;
	commitHash: string | null;
	commitMessage: string | null;
	errorMessage: string | null;
}

export interface Subtask {
	id: string;
	text: string;
	status: SubtaskStatus;
	order: number;
	category: SubtaskCategory;
	steps: Step[];
	shouldCommit: boolean;
	notes: string;
	executionLogs: ExecutionLog[];
}

export interface Task {
	id: string;
	text: string;
	status: TaskStatus;
	createdAt: number;
	description: string;
	workingDirectory: string;
	/** Optional git branch name to use for this task. */
	gitBranch?: string | null;
	tagIds?: string[];
	subtasks: Subtask[];
	brainstorm: string | null;
	architecture: string | null;
	review: string | null;
}

export type OpencodeMode = "brainstorm" | "architecture" | "review";

export interface RecentTask {
	id: string;
	text: string;
	status: string;
}

export interface Folder {
	id: string;
	name: string;
	position: number;
	createdAt: number;
	workingDirectory: string;
	taskCount: number;
	recentTasks: RecentTask[];
}
