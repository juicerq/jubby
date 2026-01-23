import { cn } from "@/lib/utils";
import type { RecentTask } from "../../types";

interface FolderPreviewProps {
	recentTasks: RecentTask[];
}

function FolderPreview({ recentTasks }: FolderPreviewProps) {
	if (recentTasks.length === 0) {
		return <span className="text-[12px] text-white/25 italic">(empty)</span>;
	}

	return (
		<div className="flex flex-col gap-1">
			{recentTasks.map((task) => (
				<div key={task.id} className="flex items-center gap-2">
					<span
						className={cn(
							"h-1.5 w-1.5 shrink-0 rounded-full",
							task.status === "completed" && "bg-white/30",
							task.status === "in_progress" && "bg-amber-500/70",
							task.status === "pending" && "bg-white/40",
						)}
					/>
					<span
						className={cn(
							"truncate text-[12px] tracking-[-0.01em]",
							task.status === "completed"
								? "text-white/30 line-through decoration-white/20"
								: "text-white/50",
						)}
					>
						{task.text}
					</span>
				</div>
			))}
		</div>
	);
}

export { FolderPreview };
export type { FolderPreviewProps };
