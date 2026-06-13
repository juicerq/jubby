import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseGrillFolder } from "@main/store/grills";
import { testClient } from "./utils/orpc";

describe("parseGrillFolder", () => {
	it("parses slug and date from canonical layout", () => {
		const parsed = parseGrillFolder("grill-viewer-13062026");

		expect(parsed.slug).toBe("grill-viewer");
		expect(parsed.title).toBe("grill viewer");
		expect(parsed.date).toEqual({
			raw: "13062026",
			day: 13,
			month: 6,
			year: 2026,
		});
	});

	it("returns null date when there are no trailing 8 digits", () => {
		const parsed = parseGrillFolder("loose-folder");

		expect(parsed.slug).toBe("loose-folder");
		expect(parsed.date).toBeNull();
	});

	it("requires exactly the 8-digit suffix, not a longer run", () => {
		const parsed = parseGrillFolder("foo-123456789");

		expect(parsed.date).toBeNull();
	});
});

describe("grills.list scan", () => {
	let projectPath: string;

	beforeEach(() => {
		projectPath = mkdtempSync(join(tmpdir(), "jubby-grill-"));
	});

	afterEach(() => {
		rmSync(projectPath, { recursive: true, force: true });
	});

	function makeGrill(
		dirName: string,
		stages: { decisions?: boolean; prd?: boolean; slices?: number },
	): void {
		const dir = join(projectPath, "grill", dirName);
		mkdirSync(dir, { recursive: true });

		if (stages.decisions) {
			writeFileSync(join(dir, "decisions.md"), "# decisions");
		}

		if (stages.prd) {
			writeFileSync(join(dir, "prd.md"), "# prd");
		}

		if (typeof stages.slices === "number") {
			const tasksDir = join(dir, "tasks");
			mkdirSync(tasksDir, { recursive: true });
			for (let i = 0; i < stages.slices; i++) {
				writeFileSync(join(tasksDir, `0${i}-slice.md`), "# slice");
			}
		}
	}

	it("returns missing when the project path does not exist", async () => {
		const result = await testClient.grills.list({
			projectPath: join(projectPath, "gone"),
		});

		expect(result.status).toBe("missing");
		expect(result.grills).toEqual([]);
	});

	it("returns no-grill-dir when the project has no grill/", async () => {
		const result = await testClient.grills.list({ projectPath });

		expect(result.status).toBe("no-grill-dir");
		expect(result.grills).toEqual([]);
	});

	it("returns ok with empty grills when grill/ is empty", async () => {
		mkdirSync(join(projectPath, "grill"), { recursive: true });

		const result = await testClient.grills.list({ projectPath });

		expect(result.status).toBe("ok");
		expect(result.grills).toEqual([]);
	});

	it("reads stage flags and slice count for each grill", async () => {
		makeGrill("alpha-01012026", { decisions: true, prd: true, slices: 3 });

		const result = await testClient.grills.list({ projectPath });
		const [grill] = result.grills;

		expect(grill?.slug).toBe("alpha");
		expect(grill?.temDecisions).toBe(true);
		expect(grill?.temPrd).toBe(true);
		expect(grill?.temSlices).toBe(true);
		expect(grill?.sliceCount).toBe(3);
	});

	it("degrades stage flags when files are missing", async () => {
		makeGrill("beta-01012026", { decisions: true });

		const result = await testClient.grills.list({ projectPath });
		const [grill] = result.grills;

		expect(grill?.temDecisions).toBe(true);
		expect(grill?.temPrd).toBe(false);
		expect(grill?.temSlices).toBe(false);
		expect(grill?.sliceCount).toBe(0);
	});

	it("orders by date desc and puts undated folders last", async () => {
		makeGrill("older-01012026", { decisions: true });
		makeGrill("newer-31122026", { decisions: true });
		makeGrill("undated-grill", { decisions: true });

		const result = await testClient.grills.list({ projectPath });

		expect(result.grills.map((g) => g.slug)).toEqual([
			"newer",
			"older",
			"undated-grill",
		]);
		expect(result.grills.at(-1)?.date).toBeNull();
	});
});
