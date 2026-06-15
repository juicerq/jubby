import { useState } from "react";
import type { RouterOutputs } from "@renderer/lib/api";
import { GrillMarkdown } from "@renderer/components/GrillMarkdown";
import { ProgressBar } from "@renderer/components/ProgressBar";
import { cn } from "@renderer/lib/cn";
import { pluralize } from "@renderer/lib/plural";

type Slice = RouterOutputs["grills"]["read"]["slices"][number];

const STATUS_CLASS: Record<Slice["status"], string> = {
	DONE: "text-accent border-accent",
	READY: "text-fg border-border",
	BLOCKED: "text-error border-error",
};

export function GrillBoard({ slices }: { slices: Slice[] }) {
	const [openFile, setOpenFile] = useState<string | null>(null);

	if (slices.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<p className="type-h2 text-fg-muted">
					<span>NENHUM SLICE NESTE GRILL</span>
					<span className="cursor-blink" />
				</p>
			</div>
		);
	}

	const openByIndex = (index: string) => {
		const target = slices.find((slice) => slice.index === index);

		if (target) {
			setOpenFile(target.fileName);
		}
	};

	const open = slices.find((slice) => slice.fileName === openFile);

	if (open) {
		return (
			<SliceReader
				slice={open}
				onBack={() => setOpenFile(null)}
				onJump={openByIndex}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between border-b border-border pb-2">
				<span className="type-ui-label text-fg-dim">slices/</span>
				<span className="type-mono-data text-fg-dim">
					{pluralize(slices.length, "SLICE", "SLICES")}
				</span>
			</div>

			<div className="flex flex-col gap-3">
				{slices.map((slice, index) => (
					<SliceCard
						key={slice.fileName}
						slice={slice}
						index={index}
						onOpen={() => setOpenFile(slice.fileName)}
						onJump={openByIndex}
					/>
				))}
			</div>
		</div>
	);
}

function SliceReader({
	slice,
	onBack,
	onJump,
}: {
	slice: Slice;
	onBack: () => void;
	onJump: (index: string) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<button
					type="button"
					onClick={onBack}
					className="type-ui-label text-fg-muted transition-colors hover:text-accent cursor-pointer"
				>
					{"< SLICES"}
				</button>

				<div className="flex shrink-0 items-center gap-2">
					{slice.type && <TypeBadge type={slice.type} />}
					<StatusBadge status={slice.status} />
				</div>
			</div>

			{slice.status === "BLOCKED" && slice.missingBlockers.length > 0 && (
				<MissingBlockers blockers={slice.missingBlockers} onJump={onJump} />
			)}

			<div className="mx-auto w-full max-w-3xl">
				<GrillMarkdown source={slice.raw} />
			</div>
		</div>
	);
}

function SliceCard({
	slice,
	index,
	onOpen,
	onJump,
}: {
	slice: Slice;
	index: number;
	onOpen: () => void;
	onJump: (index: string) => void;
}) {
	return (
		<div
			style={{ animationDelay: `${index * 45}ms` }}
			className="group grill-card-in relative flex flex-col gap-2 border border-border bg-surface-1/40 px-5 py-3 transition-colors hover:bg-surface-2"
		>
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Abrir slice ${slice.title}`}
				className="absolute inset-0 z-0 cursor-pointer"
			/>

			<div className="flex items-center gap-4">
				<span className="flex min-w-0 shrink items-baseline gap-2">
					<span className="type-mono-data text-base text-fg-dim transition-colors group-hover:text-accent">
						▸
					</span>
					{slice.index && (
						<span className="type-mono-data text-fg-dim">{slice.index}</span>
					)}
					<span className="type-task-title truncate text-fg">{slice.title}</span>
				</span>

				<SliceCriteria criteria={slice.criteria} />

				<span className="flex shrink-0 items-center gap-2">
					{slice.type && <TypeBadge type={slice.type} />}
					<StatusBadge status={slice.status} />
				</span>
			</div>

			{slice.status === "BLOCKED" && slice.missingBlockers.length > 0 && (
				<MissingBlockers blockers={slice.missingBlockers} onJump={onJump} />
			)}
		</div>
	);
}

function SliceCriteria({ criteria }: { criteria: Slice["criteria"] }) {
	if (!criteria) {
		return (
			<span className="flex flex-1 justify-end">
				<span className="type-mono-data text-fg-dim">{"\u2014"}</span>
			</span>
		);
	}

	return <ProgressBar value={criteria.checked} total={criteria.total} />;
}

function StatusBadge({ status }: { status: Slice["status"] }) {
	return (
		<span
			className={cn("type-ui-label border px-2 py-0.5", STATUS_CLASS[status])}
		>
			{status}
		</span>
	);
}

function TypeBadge({ type }: { type: NonNullable<Slice["type"]> }) {
	return (
		<span className="type-ui-label border border-fg-dim px-2 py-0.5 text-fg-muted">
			{type}
		</span>
	);
}

function MissingBlockers({
	blockers,
	onJump,
}: {
	blockers: string[];
	onJump: (index: string) => void;
}) {
	return (
		<span className="type-mono-data relative z-10 flex items-center gap-1 text-error">
			<span>blocked by</span>
			{blockers.map((ref) => (
				<button
					key={ref}
					type="button"
					onClick={() => onJump(ref)}
					className="underline transition-colors hover:text-accent cursor-pointer"
				>
					{ref}
				</button>
			))}
		</span>
	);
}
