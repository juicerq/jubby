import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskStatus } from "@shared/task-status";
import { describe, expect, it } from "vitest";
import { assertDefined } from "./utils/assertions";
import { testClient } from "./utils/orpc";

function writeData(version: number, data: unknown): void {
	assertDefined(process.env.DATA_DIR);
	writeFileSync(
		join(process.env.DATA_DIR, "data.json"),
		JSON.stringify({ version, data }),
	);
}

describe("data store v3->v4 migration", () => {
	it("drops done and preserves completedAt, deriving status", async () => {
		writeData(3, {
			folders: [{ id: "f1", name: "Legacy", createdAt: 1 }],
			tasks: [
				{
					id: "t-done",
					folderId: "f1",
					title: "done one",
					done: true,
					createdAt: 1,
					completedAt: 1700,
					tagIds: [],
				},
				{
					id: "t-pending",
					folderId: "f1",
					title: "pending one",
					done: false,
					createdAt: 2,
					tagIds: [],
				},
			],
			tags: [],
		});

		const list = await testClient.tasks.listByFolder({ folderId: "f1" });
		const doneTask = list.find((t) => t.id === "t-done");
		const pendingTask = list.find((t) => t.id === "t-pending");
		assertDefined(doneTask);
		assertDefined(pendingTask);

		expect(doneTask.completedAt).toBe(1700);
		expect(taskStatus(doneTask)).toBe("done");
		expect(taskStatus(pendingTask)).toBe("todo");
	});
});
