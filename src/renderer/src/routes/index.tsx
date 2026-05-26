import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@renderer/components/PageHeader";
import { TagFilterBar } from "@renderer/components/TagFilterBar";
import { TaskRow } from "@renderer/components/TaskRow";
import { orpc } from "@renderer/lib/api";
import { formatAge } from "@renderer/lib/now";
import { useTagFilter, validateTagSearch } from "@renderer/lib/tag-filter";

export const Route = createFileRoute("/")({
	validateSearch: validateTagSearch,
	component: IndexPage,
});

function IndexPage() {
	const filter = useTagFilter();
	const folders = useQuery(orpc.folders.list.queryOptions());
	const pending = useQuery(
		orpc.tasks.listPending.queryOptions({
			input: filter.isFiltering ? { tagIds: filter.selectedTagIds } : {},
		}),
	);

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
	const folderName = new Map(folders.data.map((f) => [f.id, f.name]));
	const now = Date.now();

	return (
		<section className="flex h-full flex-col overflow-hidden">
			<PageHeader
				title="QUEUE"
				stats={`${tasks.length} PENDING${filter.isFiltering ? " (filtered)" : ""}`}
			/>

			{/* jscpd:ignore-start */}
			<TagFilterBar
				selectedIds={filter.selectedTagIds}
				onToggle={filter.toggleTag}
				onClear={filter.clear}
			/>

			<div className="flex flex-1 flex-col overflow-y-auto">
				{/* jscpd:ignore-end */}
				{tasks.length === 0 && (
					<div className="flex flex-1 flex-col items-center justify-center gap-4">
						<p className="type-h2 text-fg-muted">
							{filter.isFiltering && <span>NO TASKS MATCH FILTER.</span>}
							{!filter.isFiltering && (
								<span>QUEUE DRAINED. NO PENDING PROCESSES.</span>
							)}
							<span className="cursor-blink" />
						</p>
					</div>
				)}

				{tasks.map((task) => (
					<TaskRow
						key={task.id}
						id={task.id}
						title={task.title}
						description={task.description}
						done={false}
						tagIds={task.tagIds}
						folderBadge={folderName.get(task.folderId) ?? "?"}
						ageLabel={formatAge(task.createdAt, now)}
					/>
				))}
			</div>
		</section>
	);
}
