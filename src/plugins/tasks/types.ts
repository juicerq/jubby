export interface Tag {
	id: string;
	name: string;
	color: string;
}

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
	id: string;
	text: string;
	status: TaskStatus;
	createdAt: number;
	tagIds?: string[];
}

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
	taskCount: number;
	recentTasks: RecentTask[];
}
