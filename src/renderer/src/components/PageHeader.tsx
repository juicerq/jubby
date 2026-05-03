import type { ReactNode } from "react";

export function PageHeader({
	title,
	stats,
}: {
	title: ReactNode;
	stats: string;
}) {
	return (
		<header className="flex flex-col gap-1 border-b border-border px-6 py-4">
			<span className="type-mono-data text-fg-dim">$ ls</span>
			<div className="flex items-center justify-between">
				<h1 className="type-h1 text-fg">{title}</h1>
				<span className="type-mono-data text-fg-dim">{stats}</span>
			</div>
		</header>
	);
}
