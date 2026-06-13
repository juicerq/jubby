import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RouterOutputs } from "@renderer/lib/api";
import { Button } from "@renderer/components/Button";
import { GrillReader } from "@renderer/components/GrillReader";
import { BindProjectModal } from "@renderer/components/modals/BindProjectModal";
import { useToast } from "@renderer/components/Toast";
import { cn } from "@renderer/lib/cn";
import { orpc } from "@renderer/lib/api";

type GrillSummary = RouterOutputs["grills"]["list"]["grills"][number];

export function GrillList({
	folderId,
	folderName,
	projectPath,
}: {
	folderId: string;
	folderName: string;
	projectPath: string;
}) {
	const [openGrill, setOpenGrill] = useState<GrillSummary | null>(null);

	const { data, isLoading } = useQuery(
		orpc.grills.list.queryOptions({
			input: { projectPath },
			staleTime: 0,
			refetchOnWindowFocus: true,
		}),
	);

	if (openGrill) {
		return (
			<GrillReader
				projectPath={projectPath}
				dirName={openGrill.dirName}
				title={openGrill.title || openGrill.slug}
				onBack={() => setOpenGrill(null)}
			/>
		);
	}

	if (isLoading) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<p className="type-mono-data text-fg-muted">
					<span>LENDO grill/...</span>
					<span className="cursor-blink" />
				</p>
			</div>
		);
	}

	if (!data || data.status === "missing") {
		return (
			<GrillDegenerate
				folderId={folderId}
				folderName={folderName}
				projectPath={projectPath}
			/>
		);
	}

	if (data.status === "no-grill-dir") {
		return <GrillEmptyState message="SEM grill/ NESTE PROJETO" />;
	}

	if (data.grills.length === 0) {
		return <GrillEmptyState message="NENHUM GRILL AINDA" />;
	}

	return (
		<div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
			{data.grills.map((grill) => (
				<GrillCard
					key={grill.dirName}
					grill={grill}
					onOpen={() => setOpenGrill(grill)}
				/>
			))}
		</div>
	);
}

function GrillEmptyState({ message }: { message: string }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2">
			<p className="type-h2 text-fg-muted">
				<span>{message}</span>
				<span className="cursor-blink" />
			</p>
		</div>
	);
}

function GrillDegenerate({
	folderId,
	folderName,
	projectPath,
}: {
	folderId: string;
	folderName: string;
	projectPath: string;
}) {
	const [binding, setBinding] = useState(false);
	const queryClient = useQueryClient();
	const toast = useToast();

	const { mutate: unbind, isPending } = useMutation(
		orpc.folders.unbindProject.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.folders.list.key() });
				toast.push("ok", "PROJETO DESVINCULADO");
			},
			onError: (err) =>
				toast.push("err", err.message || "FALHA AO DESVINCULAR PROJETO"),
		}),
	);

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
			<p className="type-h2 text-error">
				PROJETO NÃO ENCONTRADO // {projectPath}
			</p>

			<div className="flex gap-3">
				<Button variant="ghost" onClick={() => setBinding(true)}>
					RE-BIND...
				</Button>
				<Button
					variant="danger"
					loading={isPending}
					onClick={() => unbind({ id: folderId })}
				>
					UNBIND
				</Button>
			</div>

			{binding && (
				<BindProjectModal
					id={folderId}
					name={folderName}
					current={projectPath}
					onClose={() => setBinding(false)}
				/>
			)}
		</div>
	);
}

function GrillCard({
	grill,
	onOpen,
}: {
	grill: GrillSummary;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex flex-col gap-3 border border-border p-4 text-left transition-colors hover:border-accent cursor-pointer">
			<div className="flex items-start justify-between gap-4">
				<span className="type-task-title text-fg">
					{grill.title || grill.slug}
				</span>
				<span className="type-mono-data shrink-0 text-fg-muted">
					{formatGrillDate(grill.date)}
				</span>
			</div>

			<div className="flex items-center justify-between gap-4">
				<StageLamps
					temDecisions={grill.temDecisions}
					temPrd={grill.temPrd}
					temSlices={grill.temSlices}
				/>
				{grill.temSlices && (
					<span className="type-mono-data text-fg-muted">
						{formatSliceCount(grill.sliceCount)}
					</span>
				)}
			</div>
		</button>
	);
}

function formatSliceCount(count: number): string {
	if (count === 1) {
		return "1 SLICE";
	}

	return `${count} SLICES`;
}

function formatGrillDate(
	date: { day: number; month: number; year: number } | null,
): string {
	if (!date) {
		return "SEM DATA";
	}

	const dd = String(date.day).padStart(2, "0");
	const mm = String(date.month).padStart(2, "0");
	return `${dd}/${mm}/${date.year}`;
}

function StageLamps({
	temDecisions,
	temPrd,
	temSlices,
}: {
	temDecisions: boolean;
	temPrd: boolean;
	temSlices: boolean;
}) {
	return (
		<div className="flex items-center gap-1">
			<Lamp label="DEC" on={temDecisions} />
			<Arrow />
			<Lamp label="PRD" on={temPrd} />
			<Arrow />
			<Lamp label="SLICES" on={temSlices} />
		</div>
	);
}

function Arrow() {
	return <span className="type-mono-data text-fg-dim">→</span>;
}

function Lamp({ label, on }: { label: string; on: boolean }) {
	return (
		<span
			className={cn(
				"type-ui-label",
				on ? "text-accent" : "text-fg-dim line-through",
			)}
		>
			{label}
		</span>
	);
}
