import { writeFileSync } from "node:fs";
import { join } from "node:path";
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

describe("data store v2->v3 migration", () => {
	it("keeps existing folders without projectPath", async () => {
		writeData(2, {
			folders: [{ id: "f1", name: "Legacy", createdAt: 1 }],
			tasks: [],
			tags: [],
		});

		const folders = await testClient.folders.list();
		const [folder] = folders;
		assertDefined(folder);

		expect(folder.id).toBe("f1");
		expect(folder.name).toBe("Legacy");
		expect(folder.projectPath).toBeUndefined();
	});

	it("lets a migrated folder be bound afterwards", async () => {
		writeData(2, {
			folders: [{ id: "f1", name: "Legacy", createdAt: 1 }],
			tasks: [],
			tags: [],
		});

		const bound = await testClient.folders.bindProject({
			id: "f1",
			projectPath: "/abs/legacy",
		});
		expect(bound.projectPath).toBe("/abs/legacy");
	});
});
