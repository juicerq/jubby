import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Pencil, Settings, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface FolderSettingsMenuProps {
	onRename: () => void;
	onDelete: () => void;
	taskCount: number;
	tagCount: number;
	workingDirectory: string;
	onUpdateWorkingDirectory: (path: string) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function FolderSettingsMenu({
	onRename,
	onDelete,
	taskCount,
	tagCount,
	workingDirectory,
	onUpdateWorkingDirectory,
	open: controlledOpen,
	onOpenChange,
}: FolderSettingsMenuProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const [localPath, setLocalPath] = useState(workingDirectory);

	const isOpen = controlledOpen ?? uncontrolledOpen;
	const setIsOpen = onOpenChange ?? setUncontrolledOpen;

	const handleSelectFolder = async () => {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: "Select working directory",
				defaultPath: localPath || undefined,
			});
			if (selected) {
				setLocalPath(selected);
				onUpdateWorkingDirectory(selected);
			}
		} catch (error) {
			console.error("Failed to open folder picker:", error);
		}
	};

	const handleInputBlur = () => {
		if (localPath !== workingDirectory) {
			onUpdateWorkingDirectory(localPath);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.currentTarget.blur();
		} else if (e.key === "Escape") {
			setLocalPath(workingDirectory);
			setIsOpen(false);
		}
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
						isOpen && "bg-white/6 text-white/90",
					)}
					aria-label="Folder settings"
				>
					<Settings size={16} />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={4}
				collisionPadding={8}
				className="w-[280px] p-0 py-1"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex flex-col gap-1.5 px-3 py-2">
					<span className="text-[11px] font-medium text-white/40">
						Working Directory
					</span>
					<div className="flex gap-1.5">
						<input
							type="text"
							placeholder="/path/to/project"
							value={localPath}
							onChange={(e) => setLocalPath(e.target.value)}
							onBlur={handleInputBlur}
							onKeyDown={handleKeyDown}
							aria-label="Working directory"
							className="h-8 flex-1 rounded-md border border-transparent bg-white/4 px-2.5 text-[12px] font-normal text-white/90 outline-none transition-all duration-150 placeholder:text-white/30 hover:bg-white/6 focus:border-white/10 focus:bg-white/6"
						/>
						<button
							type="button"
							onClick={handleSelectFolder}
							className="group flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-white/4 transition-all duration-150 hover:border-white/10 hover:bg-white/8 active:scale-[0.96]"
							aria-label="Select folder"
							title="Select folder"
						>
							<FolderOpen className="h-3.5 w-3.5 text-white/40 transition-colors duration-150 group-hover:text-white/70" />
						</button>
					</div>
					{!localPath.trim() && (
						<span className="text-[11px] text-amber-400/70">
							Required to create tasks
						</span>
					)}
				</div>
				<div className="mx-2 my-1 border-t border-white/[0.06]" />
				<button
					type="button"
					onClick={() => {
						onRename();
						setIsOpen(false);
					}}
					className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/6"
				>
					<Pencil size={14} className="text-white/50" />
					Rename
				</button>
				<button
					type="button"
					onClick={() => {
						onDelete();
						setIsOpen(false);
					}}
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
			</PopoverContent>
		</Popover>
	);
}

export { FolderSettingsMenu };
export type { FolderSettingsMenuProps };
