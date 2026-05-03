import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@renderer/components/PageHeader";
import { Scramble } from "@renderer/components/Scramble";
import { TaskRow } from "@renderer/components/TaskRow";
import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";

export const Route = createFileRoute("/folders/$folderId")({
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

	const folders = useQuery(orpc.folders.list.queryOptions());
	const tasks = useQuery(
		orpc.tasks.listByFolder.queryOptions({ input: { folderId } }),
	);

	const folder = folders.data?.find((f) => f.id === folderId);

	if (!folder) {
		return null;
	}

	const taskList = tasks.data ?? [];
	const open = taskList.filter((t) => !t.done);
	const completed = taskList.filter((t) => t.done);

	return (
		<section className="flex h-full flex-col overflow-hidden">
			<PageHeader
				title={<Scramble key={folderId}>{folder.name}</Scramble>}
				stats={`${open.length} PENDING / ${completed.length} DONE`}
			/>

			<div className="flex flex-1 flex-col overflow-y-auto">
				{taskList.length === 0 && (
					<div className="flex flex-1 flex-col items-center justify-center gap-2">
						<p className="type-h2 text-fg-muted">
							<span>EMPTY QUEUE. APPEND A TASK TO BEGIN.</span>
							<span className="cursor-blink" />
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
					/>
				))}

				{completed.length > 0 && <DoneSection tasks={completed} />}
			</div>
		</section>
	);
}

type DoneTask = {
	id: string;
	title: string;
	description?: string;
};

function DoneSection({ tasks }: { tasks: DoneTask[] }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="border-t border-border">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="type-ui-label flex w-full items-center gap-2 px-6 py-2 text-fg-muted transition-colors hover:text-accent cursor-pointer"
			>
				{open && <ChevronDown size={14} />}
				{!open && <ChevronRight size={14} />}
				<span>COMPLETED // {tasks.length}</span>
			</button>
			{open &&
				tasks.map((task) => (
					<TaskRow
						key={task.id}
						id={task.id}
						title={task.title}
						description={task.description}
						done
					/>
				))}
		</div>
	);
}
