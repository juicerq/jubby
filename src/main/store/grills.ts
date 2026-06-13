import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type ProjectInspection = {
	exists: boolean;
	hasGrillDir: boolean;
	grillCount: number;
};

export async function inspectProject(
	projectPath: string,
): Promise<ProjectInspection> {
	const dirStat = await stat(projectPath).catch(() => null);

	if (!dirStat?.isDirectory()) {
		return { exists: false, hasGrillDir: false, grillCount: 0 };
	}

	const grillDir = join(projectPath, "grill");
	const grillStat = await stat(grillDir).catch(() => null);

	if (!grillStat?.isDirectory()) {
		return { exists: true, hasGrillDir: false, grillCount: 0 };
	}

	const entries = await readdir(grillDir, { withFileTypes: true }).catch(
		() => [],
	);
	const grillCount = entries.filter((e) => e.isDirectory()).length;

	return { exists: true, hasGrillDir: true, grillCount };
}

export type GrillDate = {
	raw: string;
	day: number;
	month: number;
	year: number;
};

export type ParsedGrillFolder = {
	slug: string;
	title: string;
	date: GrillDate | null;
};

const DATE_SUFFIX = /-(\d{8})$/;

function titleFromSlug(slug: string): string {
	return slug.replaceAll(/[-_]+/g, " ").trim();
}

export function parseGrillFolder(dirName: string): ParsedGrillFolder {
	const match = dirName.match(DATE_SUFFIX);

	if (!match) {
		return { slug: dirName, title: titleFromSlug(dirName), date: null };
	}

	const raw = match[1];
	const slug = dirName.slice(0, match.index);
	const day = Number(raw.slice(0, 2));
	const month = Number(raw.slice(2, 4));
	const year = Number(raw.slice(4, 8));

	return {
		slug,
		title: titleFromSlug(slug),
		date: { raw, day, month, year },
	};
}

export interface GrillSummary extends ParsedGrillFolder {
	dirName: string;
	temDecisions: boolean;
	temPrd: boolean;
	temSlices: boolean;
	sliceCount: number;
	progress: GrillProgress;
}

export type GrillsList = {
	status: "ok" | "missing" | "no-grill-dir";
	grills: GrillSummary[];
};

function dateSortKey(date: GrillDate | null): number {
	if (!date) {
		return -1;
	}

	return date.year * 10000 + date.month * 100 + date.day;
}

async function isDir(path: string): Promise<boolean> {
	const s = await stat(path).catch(() => null);
	return !!s?.isDirectory();
}

async function isFile(path: string): Promise<boolean> {
	const s = await stat(path).catch(() => null);
	return !!s?.isFile();
}

async function readGrill(grillDir: string, dirName: string): Promise<GrillSummary> {
	const dir = join(grillDir, dirName);
	const tasksDir = join(dir, "tasks");

	const [temDecisions, temPrd, hasTasksDir] = await Promise.all([
		isFile(join(dir, "decisions.md")),
		isFile(join(dir, "prd.md")),
		isDir(tasksDir),
	]);

	const slices = hasTasksDir ? await readSlices(tasksDir) : [];

	return {
		...parseGrillFolder(dirName),
		dirName,
		temDecisions,
		temPrd,
		temSlices: hasTasksDir,
		sliceCount: slices.length,
		progress: sliceProgress(slices),
	};
}

type SliceType = "HITL" | "AFK";

type SliceCriteria = {
	checked: number;
	total: number;
};

export type ParsedSliceBody = {
	type: SliceType | null;
	criteria: SliceCriteria | null;
	blockedBy: string[];
};

const SECTION = /^##\s+(.+?)\s*$/;
const CRITERION = /^\s*-\s+\[( |x|X)\]/;
const BLOCKER_REF = /\.\/(\d{2,})-/g;

function splitSections(body: string): Map<string, string[]> {
	const sections = new Map<string, string[]>();
	let current: string | null = null;

	for (const line of body.split("\n")) {
		const heading = line.match(SECTION);

		if (heading) {
			current = heading[1].toLowerCase();
			sections.set(current, []);
			continue;
		}

		if (current) {
			sections.get(current)?.push(line);
		}
	}

	return sections;
}

function parseType(lines: string[] | undefined): SliceType | null {
	if (!lines) {
		return null;
	}

	const text = lines.join("\n").toUpperCase();

	if (text.includes("HITL")) {
		return "HITL";
	}

	if (text.includes("AFK")) {
		return "AFK";
	}

	return null;
}

function parseCriteria(lines: string[] | undefined): SliceCriteria | null {
	if (!lines) {
		return null;
	}

	let checked = 0;
	let total = 0;

	for (const line of lines) {
		const match = line.match(CRITERION);

		if (!match) {
			continue;
		}

		total++;

		if (match[1] !== " ") {
			checked++;
		}
	}

	if (total === 0) {
		return null;
	}

	return { checked, total };
}

function parseBlockedBy(lines: string[] | undefined): string[] {
	if (!lines) {
		return [];
	}

	const refs = new Set<string>();

	for (const line of lines) {
		for (const match of line.matchAll(BLOCKER_REF)) {
			refs.add(match[1]);
		}
	}

	return [...refs];
}

export function parseSliceBody(body: string): ParsedSliceBody {
	const sections = splitSections(body);

	return {
		type: parseType(sections.get("type")),
		criteria: parseCriteria(sections.get("acceptance criteria")),
		blockedBy: parseBlockedBy(sections.get("blocked by")),
	};
}

const SLICE_INDEX = /^(\d{2,})-/;

export function sliceIndexFromFile(fileName: string): string | null {
	const match = fileName.match(SLICE_INDEX);
	return match ? match[1] : null;
}

function sliceTitleFromFile(fileName: string): string {
	const base = fileName.replace(/\.md$/, "");
	const withoutIndex = base.replace(SLICE_INDEX, "");
	return titleFromSlug(withoutIndex || base);
}

type SliceStatus = "DONE" | "READY" | "BLOCKED";

export type ParsedSlice = {
	fileName: string;
	index: string | null;
	title: string;
	type: SliceType | null;
	criteria: SliceCriteria | null;
	blockedBy: string[];
	done: boolean;
	status: SliceStatus;
	missingBlockers: string[];
	raw: string;
};

function isDone(criteria: SliceCriteria | null): boolean {
	return !!criteria && criteria.checked === criteria.total;
}

export function deriveSlices(
	parsed: { fileName: string; body: ParsedSliceBody; raw?: string }[],
): ParsedSlice[] {
	const doneByIndex = new Map<string, boolean>();

	for (const { fileName, body } of parsed) {
		const index = sliceIndexFromFile(fileName);

		if (index) {
			doneByIndex.set(index, isDone(body.criteria));
		}
	}

	return parsed.map(({ fileName, body, raw }) => {
		const done = isDone(body.criteria);
		const missingBlockers = body.blockedBy.filter(
			(ref) => doneByIndex.get(ref) !== true,
		);

		const status: SliceStatus = done
			? "DONE"
			: missingBlockers.length > 0
				? "BLOCKED"
				: "READY";

		return {
			fileName,
			index: sliceIndexFromFile(fileName),
			title: sliceTitleFromFile(fileName),
			type: body.type,
			criteria: body.criteria,
			blockedBy: body.blockedBy,
			done,
			status,
			missingBlockers,
			raw: raw ?? "",
		};
	});
}

export type GrillProgress = {
	done: number;
	total: number;
};

export function sliceProgress(slices: ParsedSlice[]): GrillProgress {
	return {
		done: slices.filter((s) => s.done).length,
		total: slices.length,
	};
}

async function readSlices(tasksDir: string): Promise<ParsedSlice[]> {
	const entries = await readdir(tasksDir, { withFileTypes: true }).catch(
		() => [],
	);
	const files = entries
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b, "pt-BR"));

	const parsed = await Promise.all(
		files.map(async (fileName) => {
			const raw = (await readMd(join(tasksDir, fileName))) ?? "";
			return {
				fileName,
				body: parseSliceBody(raw),
				raw,
			};
		}),
	);

	return deriveSlices(parsed);
}

export type GrillDocs = {
	decisions: string | null;
	prd: string | null;
	slices: ParsedSlice[];
	progress: GrillProgress;
};

function readMd(path: string): Promise<string | null> {
	return readFile(path, "utf8").catch(() => null);
}

export const Grills = {
	read: async ({
		projectPath,
		slug,
	}: {
		projectPath: string;
		slug: string;
	}): Promise<GrillDocs> => {
		const dir = join(projectPath, "grill", slug);
		const tasksDir = join(dir, "tasks");

		const [decisions, prd, hasTasksDir] = await Promise.all([
			readMd(join(dir, "decisions.md")),
			readMd(join(dir, "prd.md")),
			isDir(tasksDir),
		]);

		const slices = hasTasksDir ? await readSlices(tasksDir) : [];

		return { decisions, prd, slices, progress: sliceProgress(slices) };
	},

	list: async ({ projectPath }: { projectPath: string }): Promise<GrillsList> => {
		const projectIsDir = await isDir(projectPath);

		if (!projectIsDir) {
			return { status: "missing", grills: [] };
		}

		const grillDir = join(projectPath, "grill");
		const grillIsDir = await isDir(grillDir);

		if (!grillIsDir) {
			return { status: "no-grill-dir", grills: [] };
		}

		const entries = await readdir(grillDir, { withFileTypes: true }).catch(
			() => [],
		);
		const dirs = entries.filter((e) => e.isDirectory());

		const grills = await Promise.all(
			dirs.map((e) => readGrill(grillDir, e.name)),
		);

		grills.sort((a, b) => {
			const diff = dateSortKey(b.date) - dateSortKey(a.date);

			if (diff !== 0) {
				return diff;
			}

			return a.slug.localeCompare(b.slug, "pt-BR");
		});

		return { status: "ok", grills };
	},
};
