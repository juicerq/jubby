import { type KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { FOLDER_NAME_MAX_LENGTH } from "../../constants";

interface FolderInputProps {
	value: string;
	onChange: (value: string) => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
	onBlur: () => void;
}

function FolderInput({ value, onChange, onKeyDown, onBlur }: FolderInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isNearLimit = value.length >= FOLDER_NAME_MAX_LENGTH - 5;
	const isAtLimit = value.length >= FOLDER_NAME_MAX_LENGTH;

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div className="mb-3">
			<div className="relative">
				<input
					ref={inputRef}
					type="text"
					placeholder="Folder name..."
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={onKeyDown}
					onBlur={onBlur}
					maxLength={FOLDER_NAME_MAX_LENGTH}
					className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 pr-12 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
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
		</div>
	);
}

export { FolderInput };
export type { FolderInputProps };
