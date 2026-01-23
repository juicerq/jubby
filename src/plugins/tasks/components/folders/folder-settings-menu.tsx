import { Pencil, X } from "lucide-react";
import { useRef } from "react";
import { useClickOutside } from "../../hooks/use-click-outside";

interface FolderSettingsMenuProps {
	onRename: () => void;
	onDelete: () => void;
	onClose: () => void;
	taskCount: number;
	tagCount: number;
}

function FolderSettingsMenu({
	onRename,
	onDelete,
	onClose,
	taskCount,
	tagCount,
}: FolderSettingsMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useClickOutside(menuRef, onClose);

	return (
		<div
			ref={menuRef}
			className="absolute right-0 top-full z-20 mt-1 w-[180px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg"
			onClick={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				onClick={onRename}
				className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/6"
			>
				<Pencil size={14} className="text-white/50" />
				Rename
			</button>
			<button
				type="button"
				onClick={onDelete}
				className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] text-red-400 transition-colors hover:bg-red-500/10"
			>
				<X size={14} />
				Delete
			</button>
			<div className="mx-2 my-1 border-t border-white/[0.06]" />
			<div className="px-3 py-1.5 text-[11px] text-white/30">
				{taskCount} task{taskCount !== 1 ? "s" : ""}, {tagCount} tag
				{tagCount !== 1 ? "s" : ""}
			</div>
		</div>
	);
}

export { FolderSettingsMenu };
export type { FolderSettingsMenuProps };
