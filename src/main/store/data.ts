import { randomUUID } from "node:crypto";
import { Store } from "@main/store/Store";
import { type } from "arktype";

const folderSchema = type({
	id: "string",
	name: "string > 0",
	createdAt: "number",
	"projectPath?": "string",
});

export const tagColorSchema = type(
	"'green' | 'amber' | 'red' | 'cyan' | 'magenta'",
);

const tagSchema = type({
	id: "string",
	name: "string > 0",
	color: tagColorSchema,
	createdAt: "number",
});

const taskSchema = type({
	id: "string",
	folderId: "string",
	title: "string > 0",
	"description?": "string",
	done: "boolean",
	createdAt: "number",
	"completedAt?": "number",
	tagIds: "string[]",
});

const dataContract = type({
	folders: folderSchema.array(),
	tasks: taskSchema.array(),
	tags: tagSchema.array(),
});

type Folder = typeof folderSchema.infer;
type Tag = typeof tagSchema.infer;
type TagColor = typeof tagColorSchema.infer;
type Task = typeof taskSchema.infer;
type Data = typeof dataContract.infer;

const store = new Store({
	name: "data",
	version: 3,
	contract: dataContract,
	migrators: {
		1: (raw) => {
			const prev = raw as {
				folders: unknown[];
				tasks: { tagIds?: string[]; [k: string]: unknown }[];
			};
			return {
				folders: prev.folders,
				tasks: prev.tasks.map((t) => ({ ...t, tagIds: t.tagIds ?? [] })),
				tags: [],
			};
		},
		2: (raw) => raw,
	},
	seed: (): Data => ({ folders: [], tasks: [], tags: [] }),
});

export const dataStore = store;

function now(): number {
	return Math.floor(Date.now() / 1000);
}

export const EntityStats = {
	get: async () => {
		const data = await store.read();
		const todayKey = new Date().toLocaleDateString("en-CA");

		return {
			pendingTasks: data.tasks.filter((t) => !t.done).length,
			completedToday: data.tasks.filter(
				(t) =>
					t.done &&
					typeof t.completedAt === "number" &&
					new Date(t.completedAt * 1000).toLocaleDateString("en-CA") ===
						todayKey,
			).length,
			totalFolders: data.folders.length,
		};
	},
};

export const Folders = {
	list: async (): Promise<Folder[]> => {
		const data = await store.read();
		return data.folders;
	},

	create: async ({ name }: { name: string }): Promise<Folder> => {
		const folder: Folder = {
			id: randomUUID(),
			name,
			createdAt: now(),
		};
		await store.mutate((d) => ({ ...d, folders: [...d.folders, folder] }));
		return folder;
	},

	rename: async ({
		id,
		name,
	}: {
		id: string;
		name: string;
	}): Promise<Folder> => {
		const next = await store.mutate((d) => ({
			...d,
			folders: d.folders.map((f) => (f.id === id ? { ...f, name } : f)),
		}));
		const updated = next.folders.find((f) => f.id === id);

		if (!updated) {
			throw new Error(`folder not found: ${id}`);
		}

		return updated;
	},

	bindProject: async ({
		id,
		projectPath,
	}: {
		id: string;
		projectPath: string;
	}): Promise<Folder> => {
		const next = await store.mutate((d) => {
			const owner = d.folders.find(
				(f) => f.id !== id && f.projectPath === projectPath,
			);

			if (owner) {
				throw new Error(`projeto já vinculado à pasta '${owner.name}'`);
			}

			return {
				...d,
				folders: d.folders.map((f) =>
					f.id === id ? { ...f, projectPath } : f,
				),
			};
		});
		const updated = next.folders.find((f) => f.id === id);

		if (!updated) {
			throw new Error(`folder not found: ${id}`);
		}

		return updated;
	},

	unbindProject: async ({ id }: { id: string }): Promise<Folder> => {
		const next = await store.mutate((d) => ({
			...d,
			folders: d.folders.map((f) =>
				f.id === id ? { id: f.id, name: f.name, createdAt: f.createdAt } : f,
			),
		}));
		const updated = next.folders.find((f) => f.id === id);

		if (!updated) {
			throw new Error(`folder not found: ${id}`);
		}

		return updated;
	},

	delete: async ({
		id,
	}: {
		id: string;
	}): Promise<{ deletedTaskCount: number }> => {
		let deletedTaskCount = 0;

		await store.mutate((d) => {
			const remainingTasks = d.tasks.filter((t) => t.folderId !== id);
			deletedTaskCount = d.tasks.length - remainingTasks.length;
			return {
				...d,
				folders: d.folders.filter((f) => f.id !== id),
				tasks: remainingTasks,
			};
		});

		return { deletedTaskCount };
	},
};

const MAX_TAGS_PER_TASK = 5;
const MAX_TAG_NAME_LEN = 30;

function normalizeTagName(raw: string): string {
	const trimmed = raw.trim();

	if (trimmed.length === 0) {
		return trimmed;
	}

	return trimmed.charAt(0).toLocaleUpperCase("pt-BR") + trimmed.slice(1);
}

function tagNameKey(name: string): string {
	return name.trim().toLocaleLowerCase("pt-BR");
}

function validateTagName(raw: string): { normalized: string; key: string } {
	const normalized = normalizeTagName(raw);

	if (normalized.length === 0) {
		throw new Error("nome da tag obrigatório");
	}

	if (normalized.length > MAX_TAG_NAME_LEN) {
		throw new Error(
			`nome da tag deve ter no máximo ${MAX_TAG_NAME_LEN} caracteres`,
		);
	}

	return { normalized, key: tagNameKey(normalized) };
}

function matchesTagFilter(taskTagIds: string[], filter?: string[]): boolean {
	if (!filter || filter.length === 0) {
		return true;
	}

	return taskTagIds.some((id) => filter.includes(id));
}

export const Tasks = {
	listByFolder: async ({
		folderId,
		tagIds,
	}: {
		folderId: string;
		tagIds?: string[];
	}): Promise<Task[]> => {
		const data = await store.read();
		return data.tasks
			.filter(
				(t) => t.folderId === folderId && matchesTagFilter(t.tagIds, tagIds),
			)
			.sort((a, b) => b.createdAt - a.createdAt);
	},

	heatmap: async (): Promise<{ date: string; count: number }[]> => {
		const data = await store.read();
		const counts = new Map<string, number>();

		for (const t of data.tasks) {
			if (!t.done || typeof t.completedAt !== "number") {
				continue;
			}
			const date = new Date(t.completedAt * 1000).toLocaleDateString("en-CA");
			counts.set(date, (counts.get(date) ?? 0) + 1);
		}

		const today = new Date();
		const buckets: { date: string; count: number }[] = [];
		for (let i = 29; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(today.getDate() - i);
			const key = d.toLocaleDateString("en-CA");
			buckets.push({ date: key, count: counts.get(key) ?? 0 });
		}

		return buckets;
	},

	create: async ({
		folderId,
		title,
		description,
		tagIds,
	}: {
		folderId: string;
		title: string;
		description?: string;
		tagIds?: string[];
	}): Promise<Task> => {
		const selectedTagIds = tagIds ?? [];

		if (selectedTagIds.length > MAX_TAGS_PER_TASK) {
			throw new Error(`máximo ${MAX_TAGS_PER_TASK} tags por task`);
		}

		const task: Task = {
			id: randomUUID(),
			folderId,
			title,
			...(description ? { description } : {}),
			done: false,
			createdAt: now(),
			tagIds: selectedTagIds,
		};

		await store.mutate((d) => {
			if (!d.folders.some((f) => f.id === folderId)) {
				throw new Error(`folder not found: ${folderId}`);
			}

			for (const id of selectedTagIds) {
				if (!d.tags.some((t) => t.id === id)) {
					throw new Error(`tag not found: ${id}`);
				}
			}

			return { ...d, tasks: [...d.tasks, task] };
		});
		return task;
	},

	update: async (patch: {
		id: string;
		title?: string;
		description?: string;
		tagIds?: string[];
	}): Promise<Task> => {
		if (patch.tagIds && patch.tagIds.length > MAX_TAGS_PER_TASK) {
			throw new Error(`máximo ${MAX_TAGS_PER_TASK} tags por task`);
		}

		const next = await store.mutate((d) => {
			if (patch.tagIds) {
				for (const id of patch.tagIds) {
					if (!d.tags.some((t) => t.id === id)) {
						throw new Error(`tag not found: ${id}`);
					}
				}
			}

			return {
				...d,
				tasks: d.tasks.map((t) =>
					t.id === patch.id ? { ...t, ...patch } : t,
				),
			};
		});
		const updated = next.tasks.find((t) => t.id === patch.id);

		if (!updated) {
			throw new Error(`task not found: ${patch.id}`);
		}

		return updated;
	},

	toggleDone: async ({ id }: { id: string }): Promise<Task> => {
		const next = await store.mutate((d) => ({
			...d,
			tasks: d.tasks.map((t) => {
				if (t.id !== id) {
					return t;
				}
				const done = !t.done;
				return done
					? { ...t, done, completedAt: now() }
					: { ...t, done, completedAt: undefined };
			}),
		}));
		const updated = next.tasks.find((t) => t.id === id);

		if (!updated) {
			throw new Error(`task not found: ${id}`);
		}

		return updated;
	},

	delete: async ({ id }: { id: string }): Promise<void> => {
		await store.mutate((d) => ({
			...d,
			tasks: d.tasks.filter((t) => t.id !== id),
		}));
	},
};

export interface TagWithCount extends Tag {
	taskCount: number;
}

export const Tags = {
	list: async (): Promise<TagWithCount[]> => {
		const data = await store.read();
		const counts = new Map<string, number>();

		for (const task of data.tasks) {
			for (const id of task.tagIds) {
				counts.set(id, (counts.get(id) ?? 0) + 1);
			}
		}

		return data.tags
			.map((t) => ({ ...t, taskCount: counts.get(t.id) ?? 0 }))
			.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
	},

	create: async ({
		name,
		color,
	}: {
		name: string;
		color?: TagColor;
	}): Promise<Tag> => {
		const { normalized, key } = validateTagName(name);
		let result!: Tag;

		await store.mutate((d) => {
			const existing = d.tags.find((t) => tagNameKey(t.name) === key);

			if (existing) {
				result = existing;
				return d;
			}

			const tag: Tag = {
				id: randomUUID(),
				name: normalized,
				color: color ?? "green",
				createdAt: now(),
			};
			result = tag;
			return { ...d, tags: [...d.tags, tag] };
		});

		return result;
	},

	rename: async ({ id, name }: { id: string; name: string }): Promise<Tag> => {
		const { normalized, key } = validateTagName(name);
		const next = await store.mutate((d) => {
			const collision = d.tags.find(
				(t) => t.id !== id && tagNameKey(t.name) === key,
			);

			if (collision) {
				throw new Error(`tag já existe: ${collision.name}`);
			}

			return {
				...d,
				tags: d.tags.map((t) => (t.id === id ? { ...t, name: normalized } : t)),
			};
		});
		const updated = next.tags.find((t) => t.id === id);

		if (!updated) {
			throw new Error(`tag not found: ${id}`);
		}

		return updated;
	},

	recolor: async ({
		id,
		color,
	}: {
		id: string;
		color: TagColor;
	}): Promise<Tag> => {
		const next = await store.mutate((d) => ({
			...d,
			tags: d.tags.map((t) => (t.id === id ? { ...t, color } : t)),
		}));
		const updated = next.tags.find((t) => t.id === id);

		if (!updated) {
			throw new Error(`tag not found: ${id}`);
		}

		return updated;
	},

	delete: async ({ id }: { id: string }): Promise<void> => {
		await store.mutate((d) => ({
			...d,
			tags: d.tags.filter((t) => t.id !== id),
			tasks: d.tasks.map((t) =>
				t.tagIds.includes(id)
					? { ...t, tagIds: t.tagIds.filter((tid) => tid !== id) }
					: t,
			),
		}));
	},
};
