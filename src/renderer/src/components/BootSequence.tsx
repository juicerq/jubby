import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Scramble } from "@renderer/components/Scramble";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import { formatBytes, formatSysTime } from "@renderer/lib/now";

const LINE_DELAY_MS = 220;
const PRE_READY_MS = 240;
const READY_HOLD_MS = 380;
const FADE_MS = 280;

const LINE_DEFS = [
	{ key: "kernel", label: "INIT KERNEL" },
	{ key: "data", label: "MOUNT DATA.JSON" },
	{ key: "dirs", label: "LOAD DIRECTORIES" },
	{ key: "time", label: "SYS.TIME" },
] as const;

type LineKey = (typeof LINE_DEFS)[number]["key"];

type BootSequenceProps = {
	onComplete: (booted: boolean) => void;
};

export function BootSequence({ onComplete }: BootSequenceProps) {
	const stats = useQuery(orpc.system.stats.queryOptions());
	const folders = useQuery(orpc.folders.list.queryOptions());

	const sizeLabel = stats.data ? formatBytes(stats.data.sizeBytes) : "0B";
	const dirsLabel = folders.data ? String(folders.data.length) : "0";
	const timeLabel = formatSysTime(new Date());

	const status: Record<LineKey, string> = {
		kernel: "OK",
		data: `OK [${sizeLabel}]`,
		dirs: `OK [${dirsLabel}]`,
		time: timeLabel,
	};

	const [step, setStep] = useState(0);

	// Boot timeline driven by setTimeout chain; needs an external clock.
	useEffect(() => {
		let cancelled = false;
		const timeouts: number[] = [];

		const at = (ms: number, fn: () => void) => {
			const id = window.setTimeout(() => {
				if (!cancelled) {
					fn();
				}
			}, ms);
			timeouts.push(id);
		};

		let t = 0;

		for (let i = 0; i < LINE_DEFS.length; i++) {
			t += LINE_DELAY_MS;
			at(t, () => setStep(i + 1));
		}

		t += PRE_READY_MS;
		at(t, () => setStep(LINE_DEFS.length + 1));

		t += READY_HOLD_MS;
		at(t, () => setStep(LINE_DEFS.length + 2));

		t += FADE_MS;
		at(t, () => onComplete(true));

		const skip = () => {
			if (cancelled) {
				return;
			}
			cancelled = true;
			for (const id of timeouts) {
				clearTimeout(id);
			}
			onComplete(true);
		};

		window.addEventListener("keydown", skip);
		window.addEventListener("mousedown", skip);

		return () => {
			cancelled = true;
			for (const id of timeouts) {
				clearTimeout(id);
			}
			window.removeEventListener("keydown", skip);
			window.removeEventListener("mousedown", skip);
		};
	}, [onComplete]);

	const linesShown = Math.min(step, LINE_DEFS.length);
	const readyVisible = step > LINE_DEFS.length;
	const fading = step > LINE_DEFS.length + 1;

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg",
				fading && "pointer-events-none opacity-0 transition-opacity duration-300",
			)}
		>
			<div className="flex w-full max-w-lg flex-col gap-1 px-8">
				<div className="type-h1 text-accent">
					<Scramble>JUBBY_OS v1.0.0</Scramble>
				</div>

				<div className="type-ui-label mb-3 text-fg-dim">
					ELECTRON // NODE // TYPESCRIPT
				</div>

				<div className="mb-2 border-b border-dotted border-border" />

				{LINE_DEFS.map((line, i) => (
					<BootLine
						key={line.key}
						label={line.label}
						status={status[line.key]}
						visible={i < linesShown}
					/>
				))}

				<div className="mt-2 border-b border-dotted border-border" />

				<div
					className={cn(
						"type-mono-data mt-3 text-accent transition-opacity duration-150",
						readyVisible ? "opacity-100" : "opacity-0",
					)}
				>
					<span className="cursor-blink">&gt; READY</span>
				</div>
			</div>
		</div>
	);
}

type BootLineProps = {
	label: string;
	status: string;
	visible: boolean;
};

function BootLine({ label, status, visible }: BootLineProps) {
	return (
		<div
			className={cn(
				"type-mono-data flex items-baseline gap-2 transition-opacity duration-200",
				visible ? "opacity-100" : "opacity-0",
			)}
		>
			<span className="text-fg-muted">&gt; {label}</span>
			<span className="flex-1 self-center border-b border-dotted border-fg-dim" />
			<span className="text-accent">{status}</span>
		</div>
	);
}
