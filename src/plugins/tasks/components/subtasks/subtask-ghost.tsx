import { Check, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Subtask } from "../../types";

interface SubtaskGhostProps {
	subtask: Subtask;
}

function SubtaskGhost({ subtask }: SubtaskGhostProps) {
	return (
		<div className="flex items-center gap-2 rounded border border-dashed border-white/20 bg-white/[0.03] p-1">
			<div className="flex h-5 w-4 shrink-0 items-center justify-center">
				<GripVertical className="h-3 w-3 text-white/20" />
			</div>

			<div
				className={cn(
					"flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
					subtask.status === "completed"
						? "border-white/30 bg-white/30"
						: "border-white/15 bg-transparent",
				)}
			>
				{subtask.status === "completed" && (
					<Check className="h-2 w-2 text-[#0a0a0a]/50" />
				)}
			</div>

			<span className="flex-1 select-none text-[12px] leading-tight tracking-[-0.01em] text-white/40">
				{subtask.text}
			</span>
		</div>
	);
}

export { SubtaskGhost };
export type { SubtaskGhostProps };
