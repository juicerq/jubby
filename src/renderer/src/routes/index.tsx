import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";

export const Route = createFileRoute("/")({
	loader: async () => {
		const folders = await queryClient.ensureQueryData(
			orpc.folders.list.queryOptions(),
		);

		if (folders.length === 0) {
			return;
		}

		const settings = await queryClient.ensureQueryData(
			orpc.settings.get.queryOptions(),
		);
		const lastId = settings.lastFolderId;
		const target =
			(lastId && folders.find((f) => f.id === lastId)?.id) ?? folders[0].id;

		// eslint-disable-next-line typescript-eslint/only-throw-error
		throw redirect({
			to: "/folders/$folderId",
			params: { folderId: target },
		});
	},
	component: IndexPage,
});

function IndexPage() {
	const folders = useQuery(orpc.folders.list.queryOptions());

	if (!folders.data || folders.data.length > 0) {
		return null;
	}

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
