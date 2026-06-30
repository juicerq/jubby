import { taskStatus } from "@shared/task-status";
import { describe, expect, it } from "vitest";

describe("taskStatus", () => {
	it("returns todo when no timestamps are set", () => {
		expect(taskStatus({})).toBe("todo");
	});

	it("returns ongoing when only startedAt is set", () => {
		expect(taskStatus({ startedAt: 100 })).toBe("ongoing");
	});

	it("returns done when completedAt is set", () => {
		expect(taskStatus({ completedAt: 200 })).toBe("done");
	});

	it("prefers done over ongoing when both timestamps are set", () => {
		expect(taskStatus({ startedAt: 100, completedAt: 200 })).toBe("done");
	});
});
