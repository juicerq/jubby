import { cn } from "@renderer/lib/cn";

export function ProgressBar({ value, total }: { value: number; total: number }) {
	const complete = total > 0 && value === total;
	const ratio = total > 0 ? value / total : 0;

	return (
		<span className="flex flex-1 items-center gap-3">
			<span className="block h-1.5 flex-1 bg-surface-3">
				<span
					style={{ width: `${ratio * 100}%` }}
					className={cn(
						"block h-full transition-[width]",
						complete ? "bg-accent" : "bg-accent/60",
					)}
				/>
			</span>
			<span
				className={cn(
					"type-mono-data shrink-0 tabular-nums",
					complete ? "text-accent" : "text-fg-muted",
				)}
			>
				{value}/{total}
			</span>
		</span>
	);
}
