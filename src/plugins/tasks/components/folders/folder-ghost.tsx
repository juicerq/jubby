import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Folder } from "../../types";
import { FolderPreview } from "./folder-preview";

interface FolderGhostProps {
	folder: Folder;
}

function FolderGhost({ folder }: FolderGhostProps) {
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-2 rounded-lg select-none",
				"border border-dashed border-white/20",
				"bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
				"px-3.5 py-3",
				"shadow-[0_0_20px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.05)]",
			)}
		>
			<div className="flex items-center gap-2">
				<GripVertical size={14} className="shrink-0 text-white/30" />
				<span className="flex-1 text-[14px] font-medium text-white/60 tracking-[-0.01em]">
					{folder.name}
				</span>
				<span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/40">
					{folder.taskCount}
				</span>
			</div>

			<div className="pl-5 opacity-50">
				<FolderPreview recentTasks={folder.recentTasks} />
			</div>
		</div>
	);
}

export { FolderGhost };
export type { FolderGhostProps };
