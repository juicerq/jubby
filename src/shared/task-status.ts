export type TaskStatus = "todo" | "ongoing" | "done";

export function taskStatus(t: {
	startedAt?: number;
	completedAt?: number;
}): TaskStatus {
	if (typeof t.completedAt === "number") {
		return "done";
	}

	if (typeof t.startedAt === "number") {
		return "ongoing";
	}

	return "todo";
}
