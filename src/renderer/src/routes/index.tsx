import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { orpc } from "@renderer/lib/api";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	const folders = useQuery(orpc.folders.list.queryOptions());

	if (!folders.data) {
		return null;
	}

	const [first] = folders.data;

	if (first) {
		return (
			<Navigate to="/folders/$folderId" params={{ folderId: first.id }} replace />
		);
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
