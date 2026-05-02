import { randomUUID } from "node:crypto";
import { type } from "arktype";
import { Store } from "@main/store/Store";

const folderSchema = type({
	id: "string",
	name: "string > 0",
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
});

const dataContract = type({
	folders: folderSchema.array(),
	tasks: taskSchema.array(),
});

type Folder = typeof folderSchema.infer;
type Task = typeof taskSchema.infer;
type Data = typeof dataContract.infer;

const store = new Store({
	name: "data",
	version: 1,
	contract: dataContract,
	migrators: {},
	seed: (): Data => ({ folders: [], tasks: [] }),
});

export const dataStore = store;

function now(): number {
	return Math.floor(Date.now() / 1000);
}

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

	rename: async ({ id, name }: { id: string; name: string }): Promise<Folder> => {
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
				folders: d.folders.filter((f) => f.id !== id),
				tasks: remainingTasks,
			};
		});

		return { deletedTaskCount };
	},
};

export const Tasks = {
	listByFolder: async ({
		folderId,
	}: {
		folderId: string;
	}): Promise<Task[]> => {
		const data = await store.read();
		return data.tasks
			.filter((t) => t.folderId === folderId)
			.sort((a, b) => b.createdAt - a.createdAt);
	},

	listPending: async (): Promise<Task[]> => {
		const data = await store.read();
		return data.tasks
			.filter((t) => !t.done)
			.sort((a, b) => a.createdAt - b.createdAt);
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
	}: {
		folderId: string;
		title: string;
		description?: string;
	}): Promise<Task> => {
		const task: Task = {
			id: randomUUID(),
			folderId,
			title,
			...(description ? { description } : {}),
			done: false,
			createdAt: now(),
		};
		await store.mutate((d) => {
			if (!d.folders.some((f) => f.id === folderId)) {
				throw new Error(`folder not found: ${folderId}`);
			}
			return { ...d, tasks: [...d.tasks, task] };
		});
		return task;
	},

	update: async (patch: {
		id: string;
		title?: string;
		description?: string;
	}): Promise<Task> => {
		const next = await store.mutate((d) => ({
			...d,
			tasks: d.tasks.map((t) => (t.id === patch.id ? { ...t, ...patch } : t)),
		}));
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
