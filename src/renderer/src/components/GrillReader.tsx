import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import type { RouterOutputs } from "@renderer/lib/api";
import { GrillBoard } from "@renderer/components/GrillBoard";
import { GrillMarkdown } from "@renderer/components/GrillMarkdown";
import { TabButton } from "@renderer/components/TabButton";
import { orpc } from "@renderer/lib/api";
import { pluralize } from "@renderer/lib/plural";

type GrillDocs = RouterOutputs["grills"]["read"];

type DocTab = "decisions" | "prd" | "slices";

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
			input: { projectPath, dirName },
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
	docs: GrillDocs;
	tabs: DocTab[];
	title: string;
	onBack: () => void;
}) {
	const [active, setActive] = useState<DocTab>(defaultTab(tabs));

	return (
		<ReaderShell
			title={title}
			onBack={onBack}
			right={
				<>
					{tabs.length > 1 && (
						<div className="flex items-center">
							{tabs.map((tab) => (
								<TabButton
									key={tab}
									label={tabLabel(tab)}
									active={active === tab}
									onClick={() => setActive(tab)}
								/>
							))}
						</div>
					)}

					{active === "slices" && (
						<span className="type-mono-data text-fg-dim">
							{pluralize(docs.slices.length, "SLICE", "SLICES")}
						</span>
					)}
				</>
			}
		>
			<div className="flex flex-1 flex-col overflow-y-auto px-8 py-6">
				{active === "slices" && (
					<GrillBoard slices={docs.slices} />
				)}
				{active === "prd" && docs.prd && (
					<div className="mx-auto max-w-3xl">
						<GrillMarkdown source={docs.prd} />
					</div>
				)}
				{active === "decisions" && docs.decisions && (
					<div className="mx-auto max-w-3xl">
						<GrillMarkdown source={docs.decisions} />
					</div>
				)}
			</div>
		</ReaderShell>
	);
}

function ReaderShell({
	title,
	onBack,
	right,
	children,
}: {
	title: string;
	onBack: () => void;
	right?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
				<div className="flex min-w-0 items-center gap-3">
					<button
						type="button"
						onClick={onBack}
						className="type-ui-label shrink-0 text-fg-muted transition-colors hover:text-accent cursor-pointer"
					>
						{"< GRILLS"}
					</button>
					<span className="type-mono-data truncate text-fg-dim">
						// {title}
					</span>
				</div>

				{!!right && (
					<div className="flex shrink-0 items-center gap-4">{right}</div>
				)}
			</div>
			{children}
		</div>
	);
}

function tabLabel(tab: DocTab): string {
	if (tab === "prd") {
		return "[PRD]";
	}

	if (tab === "slices") {
		return "[SLICES]";
	}

	return "[DECISIONS]";
}

function availableTabs(docs: GrillDocs): DocTab[] {
	const tabs: DocTab[] = [];

	if (docs.decisions) {
		tabs.push("decisions");
	}

	if (docs.prd) {
		tabs.push("prd");
	}

	if (docs.slices.length > 0) {
		tabs.push("slices");
	}

	return tabs;
}

function defaultTab(tabs: DocTab[]): DocTab {
	if (tabs.includes("prd")) {
		return "prd";
	}

	return tabs[0];
}
