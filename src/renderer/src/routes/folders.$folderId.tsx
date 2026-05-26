import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@renderer/components/PageHeader";
import { Scramble } from "@renderer/components/Scramble";
import { TagFilterBar } from "@renderer/components/TagFilterBar";
import { TaskRow } from "@renderer/components/TaskRow";
import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";
import { useTagFilter, validateTagSearch } from "@renderer/lib/tag-filter";

export const Route = createFileRoute("/folders/$folderId")({
	validateSearch: validateTagSearch,
	loader: async ({ params }) => {
		const folders = await queryClient.ensureQueryData(
			orpc.folders.list.queryOptions(),
		);

		if (!folders.some((f) => f.id === params.folderId)) {
			// eslint-disable-next-line typescript-eslint/only-throw-error
			throw redirect({ to: "/" });
		}
	},
	component: FolderPage,
});

function FolderPage() {
	const { folderId } = Route.useParams();
	const filter = useTagFilter();
	const folders = useQuery(orpc.folders.list.queryOptions());
	const tasks = useQuery(
		orpc.tasks.listByFolder.queryOptions({ input: { folderId } }),
	);

	const folder = folders.data?.find((f) => f.id === folderId);

	if (!folder) {
		return null;
	}

	const taskList = tasks.data ?? [];
	const matchesFilter = (tagIds: string[]) =>
		!filter.isFiltering ||
		tagIds.some((id) => filter.selectedTagIds.includes(id));

	const allOpen = taskList.filter((t) => !t.done);
	const allCompleted = taskList.filter((t) => t.done);
	const open = allOpen.filter((t) => matchesFilter(t.tagIds));
	const completed = allCompleted.filter((t) => matchesFilter(t.tagIds));

	return (
		<section className="flex h-full flex-col overflow-hidden">
			<PageHeader
				title={<Scramble key={folderId}>{folder.name}</Scramble>}
				stats={`${open.length} PENDING / ${completed.length} DONE`}
			/>

			{/* jscpd:ignore-start */}
			<TagFilterBar
				selectedIds={filter.selectedTagIds}
				onToggle={filter.toggleTag}
				onClear={filter.clear}
			/>

			<div className="flex flex-1 flex-col overflow-y-auto">
				{/* jscpd:ignore-end */}
				{taskList.length === 0 && (
					<div className="flex flex-1 flex-col items-center justify-center gap-2">
						<p className="type-h2 text-fg-muted">
							<span>EMPTY QUEUE. APPEND A TASK TO BEGIN.</span>
							<span className="cursor-blink" />
						</p>
					</div>
				)}

				{taskList.length > 0 && open.length === 0 && filter.isFiltering && (
					<div className="px-6 py-4">
						<p className="type-mono-data text-fg-muted">
							NO OPEN TASKS MATCH FILTER.
						</p>
					</div>
				)}

				{open.map((task) => (
					<TaskRow
						key={task.id}
						id={task.id}
						title={task.title}
						description={task.description}
						done={false}
						tagIds={task.tagIds}
					/>
				))}

				{allCompleted.length > 0 && (
					<DoneSection
						tasks={completed}
						total={allCompleted.length}
						filtering={filter.isFiltering}
					/>
				)}
			</div>
		</section>
	);
}

type DoneTask = {
	id: string;
	title: string;
	description?: string;
	tagIds: string[];
};

function DoneSection({
	tasks,
	total,
	filtering,
}: {
	tasks: DoneTask[];
	total: number;
	filtering: boolean;
}) {
	const [open, setOpen] = useState(false);
	const label = filtering
		? `DONE (${tasks.length} de ${total})`
		: `COMPLETED // ${total}`;

	return (
		<div className="border-t border-border">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="type-ui-label flex w-full items-center gap-2 px-6 py-2 text-fg-muted transition-colors hover:text-accent cursor-pointer"
			>
				{open && <ChevronDown size={14} />}
				{!open && <ChevronRight size={14} />}
				<span>{label}</span>
			</button>
			{open &&
				tasks.map((task) => (
					<TaskRow
						key={task.id}
						id={task.id}
						title={task.title}
						description={task.description}
						done
						tagIds={task.tagIds}
					/>
				))}
		</div>
	);
}
