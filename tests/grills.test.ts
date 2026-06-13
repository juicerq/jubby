import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	deriveSlices,
	parseGrillFolder,
	parseSliceBody,
	sliceIndexFromFile,
	sliceProgress,
} from "@main/store/grills";
import { testClient } from "./utils/orpc";

const CANONICAL_SLICE = `## Type

AFK

## What to build

Algo aqui.

## Acceptance criteria

- [x] critério um
- [x] critério dois
- [ ] critério três

## Blocked by

- \`./02-foo.md\`
- \`./07-bar.md\`
`;

describe("parseSliceBody", () => {
	it("extracts type, criteria counts and blocked-by refs from a canonical slice", () => {
		const parsed = parseSliceBody(CANONICAL_SLICE);

		expect(parsed.type).toBe("AFK");
		expect(parsed.criteria).toEqual({ checked: 2, total: 3 });
		expect(parsed.blockedBy).toEqual(["02", "07"]);
	});

	it("reads HITL type", () => {
		const parsed = parseSliceBody("## Type\n\nHITL\n");

		expect(parsed.type).toBe("HITL");
	});

	it("degrades per field on a malformed slice without crashing", () => {
		const parsed = parseSliceBody("# just a title\n\nno sections here");

		expect(parsed.type).toBeNull();
		expect(parsed.criteria).toBeNull();
		expect(parsed.blockedBy).toEqual([]);
	});

	it("treats a section without checkbox lines as no criteria", () => {
		const parsed = parseSliceBody(
			"## Acceptance criteria\n\nfree prose, no boxes\n",
		);

		expect(parsed.criteria).toBeNull();
	});
});

describe("sliceIndexFromFile", () => {
	it("reads the leading index", () => {
		expect(sliceIndexFromFile("05-board.md")).toBe("05");
	});

	it("returns null without a leading index", () => {
		expect(sliceIndexFromFile("notes.md")).toBeNull();
	});
});

describe("deriveSlices tri-state", () => {
	it("derives DONE / READY / BLOCKED from criteria and blockers", () => {
		const slices = deriveSlices([
			{
				fileName: "02-base.md",
				body: { type: "AFK", criteria: { checked: 2, total: 2 }, blockedBy: [] },
			},
			{
				fileName: "05-board.md",
				body: {
					type: "AFK",
					criteria: { checked: 1, total: 3 },
					blockedBy: ["02"],
				},
			},
			{
				fileName: "06-drill.md",
				body: {
					type: "HITL",
					criteria: { checked: 0, total: 2 },
					blockedBy: ["05"],
				},
			},
		]);

		const byIndex = new Map(slices.map((s) => [s.index, s]));

		expect(byIndex.get("02")?.status).toBe("DONE");
		expect(byIndex.get("05")?.status).toBe("READY");
		expect(byIndex.get("06")?.status).toBe("BLOCKED");
		expect(byIndex.get("06")?.missingBlockers).toEqual(["05"]);
	});

	it("counts a slice with no criteria as not-done", () => {
		const [slice] = deriveSlices([
			{
				fileName: "01-x.md",
				body: { type: null, criteria: null, blockedBy: [] },
			},
		]);

		expect(slice.done).toBe(false);
		expect(slice.status).toBe("READY");
	});

	it("blocks when a referenced blocker is not done", () => {
		const slices = deriveSlices([
			{
				fileName: "02-base.md",
				body: { type: "AFK", criteria: { checked: 1, total: 2 }, blockedBy: [] },
			},
			{
				fileName: "03-dep.md",
				body: { type: "AFK", criteria: { checked: 0, total: 1 }, blockedBy: ["02"] },
			},
		]);

		expect(slices[1]?.status).toBe("BLOCKED");
		expect(slices[1]?.missingBlockers).toEqual(["02"]);
	});
});

describe("sliceProgress", () => {
	it("counts done over total", () => {
		const slices = deriveSlices([
			{ fileName: "01-a.md", body: { type: null, criteria: { checked: 1, total: 1 }, blockedBy: [] } },
			{ fileName: "02-b.md", body: { type: null, criteria: { checked: 0, total: 2 }, blockedBy: [] } },
			{ fileName: "03-c.md", body: { type: null, criteria: null, blockedBy: [] } },
		]);

		expect(sliceProgress(slices)).toEqual({ done: 1, total: 3 });
	});
});

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

describe("grills.read", () => {
	let projectPath: string;

	beforeEach(() => {
		projectPath = mkdtempSync(join(tmpdir(), "jubby-grill-read-"));
	});

	afterEach(() => {
		rmSync(projectPath, { recursive: true, force: true });
	});

	function writeDoc(dirName: string, file: string, body: string): void {
		const dir = join(projectPath, "grill", dirName);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, file), body);
	}

	it("returns raw content of decisions.md and prd.md when present", async () => {
		writeDoc("alpha-01012026", "decisions.md", "# decisions\n\n- one");
		writeDoc("alpha-01012026", "prd.md", "# prd\n\n- two");

		const docs = await testClient.grills.read({
			projectPath,
			dirName: "alpha-01012026",
		});

		expect(docs.decisions).toBe("# decisions\n\n- one");
		expect(docs.prd).toBe("# prd\n\n- two");
	});

	it("returns null for a document that does not exist", async () => {
		writeDoc("beta-01012026", "decisions.md", "# only decisions");

		const docs = await testClient.grills.read({
			projectPath,
			dirName: "beta-01012026",
		});

		expect(docs.decisions).toBe("# only decisions");
		expect(docs.prd).toBeNull();
	});

	it("returns both null when the grill folder is absent", async () => {
		const docs = await testClient.grills.read({
			projectPath,
			dirName: "missing-01012026",
		});

		expect(docs.decisions).toBeNull();
		expect(docs.prd).toBeNull();
		expect(docs.slices).toEqual([]);
		expect(docs.progress).toEqual({ done: 0, total: 0 });
	});

	function writeSlice(dirName: string, file: string, body: string): void {
		const dir = join(projectPath, "grill", dirName, "tasks");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, file), body);
	}

	it("parses slices and progress through grills.read", async () => {
		writeSlice(
			"gamma-01012026",
			"02-base.md",
			"## Type\n\nAFK\n\n## Acceptance criteria\n\n- [x] a\n- [x] b\n",
		);
		writeSlice(
			"gamma-01012026",
			"05-board.md",
			"## Type\n\nHITL\n\n## Acceptance criteria\n\n- [x] a\n- [ ] b\n\n## Blocked by\n\n- `./02-base.md`\n",
		);

		const docs = await testClient.grills.read({
			projectPath,
			dirName: "gamma-01012026",
		});

		expect(docs.progress).toEqual({ done: 1, total: 2 });

		const board = docs.slices.find((s) => s.index === "05");
		expect(board?.status).toBe("READY");
		expect(board?.type).toBe("HITL");
		expect(board?.criteria).toEqual({ checked: 1, total: 1 + 1 });
	});

	it("carries the raw slice body for the drill-down reader", async () => {
		const raw = "## Type\n\nAFK\n\n## What to build\n\nCorpo do slice.\n";
		writeSlice("delta-01012026", "03-reader.md", raw);

		const docs = await testClient.grills.read({
			projectPath,
			dirName: "delta-01012026",
		});

		const slice = docs.slices.find((s) => s.index === "03");
		expect(slice?.raw).toBe(raw);
	});
});
