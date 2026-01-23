import { cn } from "@/lib/utils";
import type { SubtaskStatus } from "../../types";

interface SubtaskStatusBadgeProps {
	status: SubtaskStatus;
}

function SubtaskStatusBadge({ status }: SubtaskStatusBadgeProps) {
	return (
		<span
			className={cn(
				"shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
				status === "waiting" && "bg-white/8 text-white/40",
				status === "in_progress" &&
					"animate-pulse bg-amber-500/20 text-amber-400",
				status === "completed" && "bg-emerald-500/15 text-emerald-400",
				status === "failed" && "bg-red-500/15 text-red-400",
			)}
		>
			{status === "in_progress" ? "running" : status}
		</span>
	);
}

export { SubtaskStatusBadge };
export type { SubtaskStatusBadgeProps };
