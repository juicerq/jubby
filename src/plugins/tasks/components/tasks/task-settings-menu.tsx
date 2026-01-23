import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useRef, useState } from "react";
import { useClickOutside } from "../../hooks/use-click-outside";

interface TaskSettingsMenuProps {
	workingDirectory: string;
	onUpdateWorkingDirectory: (path: string) => void;
	onClose: () => void;
}

function TaskSettingsMenu({
	workingDirectory,
	onUpdateWorkingDirectory,
	onClose,
}: TaskSettingsMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [localPath, setLocalPath] = useState(workingDirectory);

	useClickOutside(menuRef, onClose);

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
			onClose();
		}
	};

	return (
		<div
			ref={menuRef}
			className="absolute right-0 top-full z-20 mt-1 w-[280px] rounded-lg border border-white/10 bg-[#0a0a0a] p-3 shadow-lg"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="flex flex-col gap-1.5">
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
						Working directory required
					</span>
				)}
			</div>
		</div>
	);
}

export { TaskSettingsMenu };
export type { TaskSettingsMenuProps };
