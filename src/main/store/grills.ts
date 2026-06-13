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

	let sliceCount = 0;

	if (hasTasksDir) {
		const entries = await readdir(tasksDir, { withFileTypes: true }).catch(
			() => [],
		);
		sliceCount = entries.filter(
			(e) => e.isFile() && e.name.endsWith(".md"),
		).length;
	}

	return {
		...parseGrillFolder(dirName),
		dirName,
		temDecisions,
		temPrd,
		temSlices: hasTasksDir,
		sliceCount,
	};
}

export type GrillDocs = {
	decisions: string | null;
	prd: string | null;
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

		const [decisions, prd] = await Promise.all([
			readMd(join(dir, "decisions.md")),
			readMd(join(dir, "prd.md")),
		]);

		return { decisions, prd };
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
