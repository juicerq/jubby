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
		expect(task.done).toBe(false);
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

	it("toggles done and stamps completedAt", async () => {
		const folder = await testClient.folders.create({ name: "F" });
		const task = await testClient.tasks.create({
			folderId: folder.id,
			title: "x",
		});

		const done = await testClient.tasks.toggleDone({ id: task.id });
		expect(done.done).toBe(true);
		expect(done.completedAt).toBeGreaterThan(0);

		const undone = await testClient.tasks.toggleDone({ id: task.id });
		expect(undone.done).toBe(false);
		expect(undone.completedAt).toBeUndefined();
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
