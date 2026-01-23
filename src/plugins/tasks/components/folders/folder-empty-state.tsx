import { FolderOpen, Plus } from "lucide-react";

interface FolderEmptyStateProps {
	onCreate: () => void;
}

function FolderEmptyState({ onCreate }: FolderEmptyStateProps) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/35">
			<FolderOpen className="h-10 w-10 opacity-40" />
			<p className="text-[13px] font-normal tracking-[-0.01em]">
				No folders yet
			</p>
			<button
				type="button"
				onClick={onCreate}
				className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/12 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
			>
				<Plus className="h-3.5 w-3.5" />
				Create folder
			</button>
		</div>
	);
}

export { FolderEmptyState };
export type { FolderEmptyStateProps };
