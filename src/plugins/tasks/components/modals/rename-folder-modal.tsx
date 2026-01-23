import { X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { FOLDER_NAME_MAX_LENGTH } from "../../constants";

interface RenameFolderModalProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
	onClose: () => void;
}

function RenameFolderModal({
	value,
	onChange,
	onSubmit,
	onKeyDown,
	onClose,
}: RenameFolderModalProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isNearLimit = value.length >= FOLDER_NAME_MAX_LENGTH - 5;
	const isAtLimit = value.length >= FOLDER_NAME_MAX_LENGTH;

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[280px] rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="rename-folder-title"
			>
				<div className="mb-3 flex items-center justify-between">
					<h2
						id="rename-folder-title"
						className="text-[14px] font-medium text-white/90"
					>
						Rename Folder
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="relative">
					<input
						ref={inputRef}
						type="text"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						onKeyDown={onKeyDown}
						maxLength={FOLDER_NAME_MAX_LENGTH}
						className="h-10 w-full rounded-[10px] border border-white/10 bg-white/6 px-3.5 pr-12 text-[13px] tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 focus:border-white/20 focus:bg-white/8"
						autoComplete="off"
					/>
					{isNearLimit && (
						<span
							className={cn(
								"absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium transition-colors",
								isAtLimit ? "text-amber-500" : "text-white/30",
							)}
						>
							{value.length}/{FOLDER_NAME_MAX_LENGTH}
						</span>
					)}
				</div>

				<div className="mt-4 flex gap-2">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 cursor-pointer rounded-lg bg-white/6 px-4 py-2 text-[13px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/10 active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onSubmit}
						disabled={!value.trim()}
						className="flex-1 cursor-pointer rounded-lg bg-white/90 px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-all duration-150 ease-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

export { RenameFolderModal };
export type { RenameFolderModalProps };
