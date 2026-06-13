import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { GrillMarkdown } from "@renderer/components/GrillMarkdown";
import { TabButton } from "@renderer/components/TabButton";
import { orpc } from "@renderer/lib/api";

type DocTab = "decisions" | "prd";

export function GrillReader({
	projectPath,
	dirName,
	title,
	onBack,
}: {
	projectPath: string;
	dirName: string;
	title: string;
	onBack: () => void;
}) {
	const { data, isLoading } = useQuery(
		orpc.grills.read.queryOptions({
			input: { projectPath, slug: dirName },
			staleTime: 0,
			refetchOnWindowFocus: true,
		}),
	);

	if (isLoading || !data) {
		return (
			<ReaderShell title={title} onBack={onBack}>
				<div className="flex flex-1 items-center justify-center">
					<p className="type-mono-data text-fg-muted">
						<span>LENDO DOCUMENTOS...</span>
						<span className="cursor-blink" />
					</p>
				</div>
			</ReaderShell>
		);
	}

	const tabs = availableTabs(data);

	if (tabs.length === 0) {
		return (
			<ReaderShell title={title} onBack={onBack}>
				<div className="flex flex-1 items-center justify-center">
					<p className="type-h2 text-fg-muted">
						<span>NENHUM DOCUMENTO NESTE GRILL</span>
						<span className="cursor-blink" />
					</p>
				</div>
			</ReaderShell>
		);
	}

	return (
		<ReaderBody
			docs={data}
			tabs={tabs}
			title={title}
			onBack={onBack}
		/>
	);
}

function ReaderBody({
	docs,
	tabs,
	title,
	onBack,
}: {
	docs: { decisions: string | null; prd: string | null };
	tabs: DocTab[];
	title: string;
	onBack: () => void;
}) {
	const [active, setActive] = useState<DocTab>(defaultTab(tabs));
	const source = active === "prd" ? docs.prd : docs.decisions;

	return (
		<ReaderShell title={title} onBack={onBack}>
			<div className="flex border-b border-border">
				{tabs.map((tab) => (
					<TabButton
						key={tab}
						label={tabLabel(tab)}
						active={active === tab}
						onClick={() => setActive(tab)}
					/>
				))}
			</div>

			<div className="flex-1 overflow-y-auto px-8 py-6">
				{source && (
					<div className="mx-auto max-w-3xl">
						<GrillMarkdown source={source} />
					</div>
				)}
			</div>
		</ReaderShell>
	);
}

function ReaderShell({
	title,
	onBack,
	children,
}: {
	title: string;
	onBack: () => void;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="flex items-center gap-3 border-b border-border px-6 py-3">
				<button
					type="button"
					onClick={onBack}
					className="type-ui-label text-fg-muted transition-colors hover:text-accent cursor-pointer"
				>
					{"< GRILLS"}
				</button>
				<span className="type-mono-data truncate text-fg-dim">// {title}</span>
			</div>
			{children}
		</div>
	);
}

function tabLabel(tab: DocTab): string {
	if (tab === "prd") {
		return "[PRD]";
	}

	return "[DECISIONS]";
}

function availableTabs(docs: {
	decisions: string | null;
	prd: string | null;
}): DocTab[] {
	const tabs: DocTab[] = [];

	if (docs.decisions) {
		tabs.push("decisions");
	}

	if (docs.prd) {
		tabs.push("prd");
	}

	return tabs;
}

function defaultTab(tabs: DocTab[]): DocTab {
	if (tabs.includes("prd")) {
		return "prd";
	}

	return tabs[0];
}
