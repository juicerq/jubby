import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskProgressBadgeProps {
	completed: number;
	total: number;
}

function TaskProgressBadge({ completed, total }: TaskProgressBadgeProps) {
	const isAllComplete = completed === total && total > 0;

	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-tight transition-all duration-150 ease-out",
				isAllComplete
					? "bg-emerald-500/15 text-emerald-400"
					: "bg-white/6 text-white/45",
			)}
		>
			<Check
				className={cn(
					"h-2.5 w-2.5",
					isAllComplete ? "text-emerald-400" : "text-white/35",
				)}
			/>
			{completed}/{total}
		</span>
	);
}

export { TaskProgressBadge };
export type { TaskProgressBadgeProps };
