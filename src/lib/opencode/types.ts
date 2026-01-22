export type OpenCodeSessionId = string;

export type OpenCodeSessionStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "aborted"
	| "unknown";

export interface OpenCodeSessionMeta {
	id: OpenCodeSessionId;
	taskId?: string;
	subtaskId?: string;
	startedAt: string;
	status?: OpenCodeSessionStatus;
}
