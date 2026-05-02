import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { TaskRow } from "@renderer/components/TaskRow";
import { orpc } from "@renderer/lib/api";
import { formatAge } from "@renderer/lib/now";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	const folders = useQuery(orpc.folders.list.queryOptions());
	const pending = useQuery(orpc.tasks.listPending.queryOptions());

	if (!folders.data) {
		return null;
	}

	if (folders.data.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4">
				<p className="type-h2 text-fg-muted">
					<span>VOID. NO DIRECTORIES INITIALIZED.</span>
					<span className="cursor-blink" />
				</p>
				<p className="type-mono-data text-fg-dim">
					Click [+] in DIRECTORIES to initialize one.
				</p>
			</div>
		);
	}

	if (!pending.data) {
		return null;
	}

	const tasks = pending.data;

	if (tasks.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4">
				<p className="type-h2 text-fg-muted">
					<span>QUEUE DRAINED. NO PENDING PROCESSES.</span>
					<span className="cursor-blink" />
				</p>
			</div>
		);
	}

	const folderName = new Map(folders.data.map((f) => [f.id, f.name]));
	const now = Date.now();

	return (
		<section className="flex h-full flex-col overflow-hidden">
			<header className="flex items-center justify-between border-b border-border px-6 py-4">
				<div className="flex flex-col gap-1">
					<span className="type-mono-data text-fg-dim">$ ls queue</span>
					<h1 className="type-h1 text-fg">QUEUE // {tasks.length} PENDING</h1>
				</div>
			</header>

			<div className="flex flex-1 flex-col overflow-y-auto">
				{tasks.map((task) => (
					<TaskRow
						key={task.id}
						id={task.id}
						title={task.title}
						description={task.description}
						done={false}
						folderBadge={folderName.get(task.folderId) ?? "?"}
						ageLabel={formatAge(task.createdAt, now)}
					/>
				))}
			</div>
		</section>
	);
}
