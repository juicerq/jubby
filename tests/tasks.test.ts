import { EntityStats } from "@main/store/data";
import { taskStatus } from "@shared/task-status";
import { describe, expect, it } from "vitest";
import { assertDefined } from "./utils/assertions";
import { testClient } from "./utils/orpc";

describe("tasks", () => {
	it("creates a task in a folder", async () => {
		const folder = await testClient.folders.create({ name: "Work" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "First task",
			description: "details",
		});

		expect(task.title).toBe("First task");
		expect(task.description).toBe("details");
		expect(task.folderId).toBe(folder.id);
		expect(taskStatus(task)).toBe("todo");
		expect(task.startedAt).toBeUndefined();
		expect(task.completedAt).toBeUndefined();
	});

	it("rejects creating a task in a non-existing folder", async () => {
		await expect(
			testClient.tasks.create({ folderId: "ghost", title: "x" }),
		).rejects.toThrow();
	});

	it("rejects empty title", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		await expect(
			testClient.tasks.create({ folderId: folder.id, title: "" }),
		).rejects.toThrow();
	});

	it("lists tasks in a folder, newest first", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		await testClient.tasks.create({ folderId: folder.id, title: "older" });
		await new Promise((resolve) => {
			setTimeout(resolve, 1100);
		});
		await testClient.tasks.create({ folderId: folder.id, title: "newer" });

		const list = await testClient.tasks.listByFolder({ folderId: folder.id });
		expect(list.length).toBe(2);
		const [first, second] = list;
		assertDefined(first);
		assertDefined(second);
		expect(first.title).toBe("newer");
		expect(second.title).toBe("older");
	});

	it("only lists tasks from the requested folder", async () => {
		const a = await testClient.folders.create({ name: "A" });
		const b = await testClient.folders.create({ name: "B" });
		await testClient.tasks.create({ folderId: a.id, title: "x" });
		await testClient.tasks.create({ folderId: b.id, title: "y" });

		const aList = await testClient.tasks.listByFolder({ folderId: a.id });
		expect(aList.length).toBe(1);
		expect(aList[0]?.title).toBe("x");
	});

	it("cycles a task through todo -> on-going -> done -> todo", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "x",
		});

		const ongoing = await testClient.tasks.cycleStatus({ id: task.id });
		expect(taskStatus(ongoing)).toBe("ongoing");
		expect(ongoing.startedAt).toBeGreaterThan(0);
		expect(ongoing.completedAt).toBeUndefined();

		const done = await testClient.tasks.cycleStatus({ id: task.id });
		expect(taskStatus(done)).toBe("done");
		expect(done.startedAt).toBeGreaterThan(0);
		expect(done.completedAt).toBeGreaterThan(0);

		const reopened = await testClient.tasks.cycleStatus({ id: task.id });
		expect(taskStatus(reopened)).toBe("todo");
		expect(reopened.startedAt).toBeUndefined();
		expect(reopened.completedAt).toBeUndefined();
	});

	it("demotes the previous on-going task when another is started", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const a = await testClient.tasks.create({
			folderId: folder.id,
			title: "A",
		});
		const b = await testClient.tasks.create({
			folderId: folder.id,
			title: "B",
		});

		await testClient.tasks.cycleStatus({ id: a.id });
		await testClient.tasks.cycleStatus({ id: b.id });

		const list = await testClient.tasks.listByFolder({ folderId: folder.id });
		const aAfter = list.find((t) => t.id === a.id);
		const bAfter = list.find((t) => t.id === b.id);
		assertDefined(aAfter);
		assertDefined(bAfter);

		expect(taskStatus(aAfter)).toBe("todo");
		expect(aAfter.startedAt).toBeUndefined();
		expect(taskStatus(bAfter)).toBe("ongoing");
	});

	it("stops an on-going task back to todo", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "x",
		});

		await testClient.tasks.cycleStatus({ id: task.id });
		const stopped = await testClient.tasks.stop({ id: task.id });

		expect(taskStatus(stopped)).toBe("todo");
		expect(stopped.startedAt).toBeUndefined();
		expect(stopped.completedAt).toBeUndefined();
	});

	it("stop is a no-op on a task that is not on-going", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "x",
		});

		await testClient.tasks.cycleStatus({ id: task.id });
		await testClient.tasks.cycleStatus({ id: task.id });

		const after = await testClient.tasks.stop({ id: task.id });

		expect(taskStatus(after)).toBe("done");
		expect(after.startedAt).toBeGreaterThan(0);
	});

	it("counts an on-going task as pending, not completed", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "x",
		});

		await testClient.tasks.cycleStatus({ id: task.id });
		const ongoingStats = await EntityStats.get();
		expect(ongoingStats.pendingTasks).toBe(1);
		expect(ongoingStats.completedToday).toBe(0);

		await testClient.tasks.cycleStatus({ id: task.id });
		const doneStats = await EntityStats.get();
		expect(doneStats.pendingTasks).toBe(0);
		expect(doneStats.completedToday).toBe(1);
	});

	it("updates title and description", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "old",
		});

		const updated = await testClient.tasks.update({
			id: task.id,
			title: "new",
			description: "added",
		});
		expect(updated.title).toBe("new");
		expect(updated.description).toBe("added");
	});

	it("deletes a single task", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "x",
		});

		await testClient.tasks.delete({ id: task.id });
		const list = await testClient.tasks.listByFolder({ folderId: folder.id });
		expect(list).toEqual([]);
	});
});
