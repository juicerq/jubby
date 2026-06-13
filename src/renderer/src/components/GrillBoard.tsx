import { useState } from "react";
import type { RouterOutputs } from "@renderer/lib/api";
import { GrillMarkdown } from "@renderer/components/GrillMarkdown";
import { cn } from "@renderer/lib/cn";

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
		<div className="flex flex-col gap-3">
			{slices.map((slice) => (
				<SliceCard
					key={slice.fileName}
					slice={slice}
					onOpen={() => setOpenFile(slice.fileName)}
					onJump={openByIndex}
				/>
			))}
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
	onOpen,
	onJump,
}: {
	slice: Slice;
	onOpen: () => void;
	onJump: (index: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2 border border-border">
			<button
				type="button"
				onClick={onOpen}
				className="flex items-start justify-between gap-4 px-4 pt-4 text-left transition-colors hover:bg-surface-1 cursor-pointer"
			>
				<div className="flex items-baseline gap-3">
					{slice.index && (
						<span className="type-mono-data text-fg-dim">{slice.index}</span>
					)}
					<span className="type-task-title text-fg">{slice.title}</span>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					{slice.type && <TypeBadge type={slice.type} />}
					<StatusBadge status={slice.status} />
				</div>
			</button>

			<div className="flex items-center justify-between gap-4 px-4 pb-4">
				<span className="type-mono-data text-fg-muted">
					{formatProgress(slice.criteria)}
				</span>

				{slice.status === "BLOCKED" && slice.missingBlockers.length > 0 && (
					<MissingBlockers blockers={slice.missingBlockers} onJump={onJump} />
				)}
			</div>
		</div>
	);
}

function formatProgress(criteria: Slice["criteria"]): string {
	if (!criteria) {
		return "\u2014";
	}

	return `${criteria.checked}/${criteria.total}`;
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
		<span className="type-mono-data flex items-center gap-1 text-error">
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
