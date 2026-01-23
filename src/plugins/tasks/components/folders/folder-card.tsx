import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Folder } from "../../types";
import { FolderPreview } from "./folder-preview";

interface FolderCardProps {
	folder: Folder;
	onClick: () => void;
	isDragging?: boolean;
	onMouseDown?: (e: React.MouseEvent) => void;
	cardRef?: (el: HTMLDivElement | null) => void;
}

function FolderCard({
	folder,
	onClick,
	isDragging = false,
	onMouseDown,
	cardRef,
}: FolderCardProps) {
	return (
		<div
			ref={cardRef}
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			onMouseDown={onMouseDown}
			className={cn(
				"group flex w-full flex-col gap-2 rounded-lg text-left cursor-pointer select-none",
				"border border-white/[0.04] bg-white/[0.02]",
				"px-3.5 py-3 transition-all duration-150 ease-out",
				"hover:border-white/[0.08] hover:bg-white/[0.04]",
				"hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
				"active:scale-[0.99] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
				isDragging && "opacity-40 scale-[0.97] pointer-events-none",
			)}
		>
			<div className="flex items-center gap-2">
				<GripVertical
					size={14}
					className="shrink-0 text-white/20 transition-colors duration-150 group-hover:text-white/40 cursor-grab"
				/>
				<span className="flex-1 text-[14px] font-medium text-white/90 tracking-[-0.01em]">
					{folder.name}
				</span>
				<span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-white/50">
					{folder.taskCount}
				</span>
			</div>

			<div className="pl-5">
				<FolderPreview recentTasks={folder.recentTasks} />
			</div>
		</div>
	);
}

export { FolderCard };
export type { FolderCardProps };
