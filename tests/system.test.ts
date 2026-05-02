import { describe, expect, it } from "vitest";
import { testClient } from "./utils/orpc";

describe("system.stats", () => {
	it("returns zero size and null lastFlushAt before any write", async () => {
		const stats = await testClient.system.stats();
		expect(stats.name).toBe("data");
		expect(stats.sizeBytes).toBe(0);
		expect(stats.lastFlushAt).toBeNull();
	});

	it("reports size and lastFlushAt after a write", async () => {
		const before = Date.now();
		await testClient.folders.create({ name: "Work" });
		const stats = await testClient.system.stats();

		expect(stats.sizeBytes).toBeGreaterThan(0);
		expect(stats.lastFlushAt).not.toBeNull();
		const flushedAt = stats.lastFlushAt;
		expect(flushedAt).not.toBeNull();

		if (flushedAt !== null) {
			expect(flushedAt).toBeGreaterThanOrEqual(before);
		}
	});
});
