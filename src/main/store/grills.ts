import { readdir, stat } from "node:fs/promises";
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
