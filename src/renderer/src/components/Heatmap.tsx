import { useQuery } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";

const PLACEHOLDER: { date: string; count: number }[] = Array.from(
	{ length: 30 },
	(_, i) => ({ date: `placeholder-${i}`, count: 0 }),
);

function intensity(count: number): number {
	if (count === 0) {
		return 0.08;
	}

	if (count <= 2) {
		return 0.3;
	}

	if (count <= 5) {
		return 0.6;
	}

	return 1;
}

export function Heatmap() {
	const heatmap = useQuery(orpc.tasks.heatmap.queryOptions());
	const buckets = heatmap.data ?? PLACEHOLDER;
	const ready = !!heatmap.data;

	return (
		<div className="border-t border-border px-3 py-3">
			<div className="flex items-end gap-[1px]">
				{buckets.toReversed().map((bucket) => (
					<div
						key={bucket.date}
						title={ready ? `${bucket.date} · ${bucket.count} done` : undefined}
						className="h-2 w-[4px] bg-accent"
						style={{ opacity: intensity(bucket.count) }}
					/>
				))}
			</div>
		</div>
	);
}
