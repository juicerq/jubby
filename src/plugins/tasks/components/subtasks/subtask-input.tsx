import { Plus } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SubtaskInputProps {
	onCreateSubtask: (text: string) => void;
}

function SubtaskInput({ onCreateSubtask }: SubtaskInputProps) {
	const [value, setValue] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = () => {
		if (!value.trim()) return;
		onCreateSubtask(value.trim());
		setValue("");
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		} else if (e.key === "Escape") {
			setValue("");
			inputRef.current?.blur();
		}
	};

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded py-1 transition-all duration-150 ease-out",
				isFocused && "bg-white/[0.02]",
			)}
		>
			<div className="flex h-5 w-4 shrink-0 items-center justify-center">
				<Plus
					className={cn(
						"h-3 w-3 transition-colors duration-150",
						isFocused ? "text-white/40" : "text-white/20",
					)}
				/>
			</div>

			<input
				ref={inputRef}
				type="text"
				placeholder="Add subtask..."
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onFocus={() => setIsFocused(true)}
				onBlur={() => {
					setIsFocused(false);
					if (value.trim()) {
						handleSubmit();
					}
				}}
				className="h-5 flex-1 bg-transparent text-[12px] leading-tight tracking-[-0.01em] text-white/70 outline-none placeholder:text-white/25"
				autoComplete="off"
			/>
		</div>
	);
}

export { SubtaskInput };
export type { SubtaskInputProps };
