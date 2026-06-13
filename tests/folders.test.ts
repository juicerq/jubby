import { describe, expect, it } from "vitest";
import { assertDefined } from "./utils/assertions";
import { testClient } from "./utils/orpc";

describe("folders", () => {
	it("returns empty list when no folders exist", async () => {
		const list = await testClient.folders.list();
		expect(list).toEqual([]);
	});

	it("creates a folder and returns it", async () => {
		const created = await testClient.folders.create({ name: "Work" });
		expect(created.name).toBe("Work");
		expect(created.id).toMatch(/.+/);
		expect(created.createdAt).toBeGreaterThan(0);
	});

	it("lists folders in creation order", async () => {
		await testClient.folders.create({ name: "First" });
		await testClient.folders.create({ name: "Second" });
		const list = await testClient.folders.list();

		expect(list.length).toBe(2);
		const [a, b] = list;
		assertDefined(a);
		assertDefined(b);
		expect(a.name).toBe("First");
		expect(b.name).toBe("Second");
	});

	it("renames a folder", async () => {
		const created = await testClient.folders.create({ name: "Old" });
		const renamed = await testClient.folders.rename({
			id: created.id,
			name: "New",
		});
		expect(renamed.name).toBe("New");

		const list = await testClient.folders.list();
		const [first] = list;
		assertDefined(first);
		expect(first.name).toBe("New");
	});

	it("rejects empty folder names", async () => {
		await expect(testClient.folders.create({ name: "" })).rejects.toThrow();
	});

	it("deletes a folder and its tasks (cascade)", async () => {
		const folder = await testClient.folders.create({ name: "Doomed" });
		await testClient.tasks.create({ folderId: folder.id, title: "T1" });
		await testClient.tasks.create({ folderId: folder.id, title: "T2" });

		const result = await testClient.folders.delete({ id: folder.id });
		expect(result.deletedTaskCount).toBe(2);

		const folders = await testClient.folders.list();
		expect(folders.length).toBe(0);

		const remaining = await testClient.tasks.listByFolder({
			folderId: folder.id,
		});
		expect(remaining).toEqual([]);
	});

	it("does not delete tasks from other folders on cascade", async () => {
		const a = await testClient.folders.create({ name: "A" });
		const b = await testClient.folders.create({ name: "B" });
		await testClient.tasks.create({ folderId: a.id, title: "kept" });
		await testClient.tasks.create({ folderId: b.id, title: "purged" });

		await testClient.folders.delete({ id: b.id });

		const aTasks = await testClient.tasks.listByFolder({ folderId: a.id });
		expect(aTasks.length).toBe(1);
	});

	it("binds a project path to a folder", async () => {
		const folder = await testClient.folders.create({ name: "Proj" });
		const bound = await testClient.folders.bindProject({
			id: folder.id,
			projectPath: "/abs/path/proj",
		});
		expect(bound.projectPath).toBe("/abs/path/proj");
	});

	it("unbinds a project path from a folder", async () => {
		const folder = await testClient.folders.create({ name: "Proj" });
		await testClient.folders.bindProject({
			id: folder.id,
			projectPath: "/abs/path/proj",
		});
		const unbound = await testClient.folders.unbindProject({ id: folder.id });
		expect(unbound.projectPath).toBeUndefined();
	});

	it("rebinding the same folder to its own path is allowed", async () => {
		const folder = await testClient.folders.create({ name: "Proj" });
		await testClient.folders.bindProject({
			id: folder.id,
			projectPath: "/abs/path/proj",
		});
		const rebound = await testClient.folders.bindProject({
			id: folder.id,
			projectPath: "/abs/path/proj",
		});
		expect(rebound.projectPath).toBe("/abs/path/proj");
	});

	it("rejects binding a path already owned by another folder, naming the owner", async () => {
		const owner = await testClient.folders.create({ name: "Dona" });
		const other = await testClient.folders.create({ name: "Outra" });
		await testClient.folders.bindProject({
			id: owner.id,
			projectPath: "/abs/path/shared",
		});

		await expect(
			testClient.folders.bindProject({
				id: other.id,
				projectPath: "/abs/path/shared",
			}),
		).rejects.toThrow(/Dona/);
	});
});
