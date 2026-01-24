import { Check, Plus, Trash2, X } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { TAG_COLORS } from "../../constants";
import type { Tag as TagType } from "../../types";
import { usePendingDelete } from "../../useTasksStorage";

interface TagColorPickerProps {
	selectedColor: string;
	onSelectColor: (color: string) => void;
	trigger: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function TagColorPicker({
	selectedColor,
	onSelectColor,
	trigger,
	open: controlledOpen,
	onOpenChange,
}: TagColorPickerProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

	const isOpen = controlledOpen ?? uncontrolledOpen;
	const setIsOpen = onOpenChange ?? setUncontrolledOpen;

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={4}
				collisionPadding={8}
				className="w-max p-2"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="grid grid-cols-4 gap-1">
					{TAG_COLORS.map((color) => (
						<button
							key={color.hex}
							type="button"
							onClick={() => {
								onSelectColor(color.hex);
								setIsOpen(false);
							}}
							className={cn(
								"flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border transition-all duration-150 ease-out hover:scale-110",
								selectedColor === color.hex
									? "border-white/40"
									: "border-transparent hover:border-white/20",
							)}
							aria-label={color.name}
							title={color.name}
						>
							<span
								className="h-3.5 w-3.5 rounded-full"
								style={{ backgroundColor: color.hex }}
							/>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

interface TagCreateRowProps {
	onCreateTag: (name: string, color: string) => Promise<boolean>;
}

function TagCreateRow({ onCreateTag }: TagCreateRowProps) {
	const [name, setName] = useState("");
	const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0].hex);

	const handleSubmit = async () => {
		if (!name.trim()) return;

		const success = await onCreateTag(name.trim(), selectedColor);
		if (success) {
			setName("");
			setSelectedColor(TAG_COLORS[0].hex);
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleSubmit();
		}
	};

	return (
		<div className="flex items-center gap-2">
			<TagColorPicker
				selectedColor={selectedColor}
				onSelectColor={setSelectedColor}
				trigger={
					<button
						type="button"
						className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-transparent bg-white/4 transition-all duration-150 ease-out hover:bg-white/8 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						aria-label="Select color"
					>
						<span
							className="h-4 w-4 rounded-full"
							style={{ backgroundColor: selectedColor }}
						/>
					</button>
				}
			/>

			<input
				type="text"
				placeholder="New tag..."
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={handleKeyDown}
				maxLength={20}
				className="h-8 flex-1 rounded-md border border-transparent bg-white/4 px-2.5 text-[13px] text-white/90 outline-none transition-all duration-150 ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6"
				autoComplete="off"
			/>

			<button
				type="button"
				onClick={handleSubmit}
				disabled={!name.trim()}
				className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-transparent bg-white/4 text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
				aria-label="Create tag"
			>
				<Plus className="h-4 w-4" />
			</button>
		</div>
	);
}

interface TagManageRowProps {
	tag: TagType;
	allTags: TagType[];
	onUpdateTag: (id: string, name: string, color: string) => Promise<boolean>;
	onDeleteTag: (id: string) => Promise<void>;
}

function TagManageRow({
	tag,
	allTags,
	onUpdateTag,
	onDeleteTag,
}: TagManageRowProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(tag.name);
	const { pendingId, handleDeleteClick, cancelDelete } =
		usePendingDelete(onDeleteTag);
	const isPendingDelete = pendingId === tag.id;
	const inputRef = useRef<HTMLInputElement>(null);
	const rowRef = useRef<HTMLDivElement>(null);

	const isDuplicate = allTags.some(
		(t) =>
			t.id !== tag.id && t.name.toLowerCase() === editName.trim().toLowerCase(),
	);
	const isEmpty = !editName.trim();
	const hasError = isDuplicate || isEmpty;

	const startEditing = () => {
		setIsEditing(true);
		setEditName(tag.name);
		cancelDelete();
	};

	const saveEdit = useCallback(async () => {
		if (hasError) return;
		if (editName.trim() !== tag.name) {
			await onUpdateTag(tag.id, editName.trim(), tag.color);
		}
		setIsEditing(false);
	}, [hasError, editName, tag.name, tag.id, tag.color, onUpdateTag]);

	const cancelEdit = () => {
		setIsEditing(false);
		setEditName(tag.name);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			saveEdit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			cancelEdit();
		}
	};

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	useEffect(() => {
		if (!isEditing) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (rowRef.current && !rowRef.current.contains(event.target as Node)) {
				saveEdit();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isEditing, saveEdit]);

	const handleColorSelect = async (color: string) => {
		await onUpdateTag(tag.id, tag.name, color);
	};

	return (
		<div
			ref={rowRef}
			className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/4"
		>
			<TagColorPicker
				selectedColor={tag.color}
				onSelectColor={handleColorSelect}
				trigger={
					<button
						type="button"
						className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent transition-all duration-150 ease-out hover:bg-white/8 active:border-white/15"
						aria-label="Change color"
					>
						<span
							className="h-3 w-3 rounded-full"
							style={{ backgroundColor: tag.color }}
						/>
					</button>
				}
			/>

			{isEditing ? (
				<>
					<div className="flex min-w-0 flex-1 flex-col">
						<input
							ref={inputRef}
							type="text"
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
							onKeyDown={handleKeyDown}
							maxLength={20}
							className={cn(
								"h-6 w-full rounded border bg-white/6 px-2 text-[12px] text-white/90 outline-none transition-all duration-150",
								hasError
									? "border-red-500/50 focus:border-red-500"
									: "border-transparent focus:border-white/20",
							)}
							autoComplete="off"
						/>
						{isDuplicate && (
							<span className="mt-0.5 text-[10px] text-red-400">
								Name already exists
							</span>
						)}
					</div>

					<button
						type="button"
						onClick={saveEdit}
						disabled={hasError}
						className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-green-400 disabled:cursor-not-allowed disabled:opacity-40 active:border-white/15"
						aria-label="Save"
					>
						<Check className="h-3 w-3" />
					</button>

					<button
						type="button"
						onClick={cancelEdit}
						className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 active:border-white/15"
						aria-label="Cancel"
					>
						<X className="h-3 w-3" />
					</button>
				</>
			) : (
				<>
					<button
						type="button"
						onClick={startEditing}
						className="min-w-0 flex-1 cursor-text truncate text-left text-[12px] text-white/80 transition-colors hover:text-white/95"
					>
						{tag.name}
					</button>

					<button
						type="button"
						onClick={() => handleDeleteClick(tag.id)}
						className={cn(
							"flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent transition-all duration-150 ease-out active:border-white/15",
							isPendingDelete
								? "bg-red-500/20 text-red-500"
								: "text-white/30 opacity-0 hover:bg-white/8 hover:text-red-400 group-hover:opacity-100",
						)}
						aria-label={isPendingDelete ? "Confirm delete" : "Delete tag"}
					>
						{isPendingDelete ? (
							<Check className="h-3 w-3" />
						) : (
							<Trash2 className="h-3 w-3" />
						)}
					</button>
				</>
			)}
		</div>
	);
}

export { TagColorPicker, TagCreateRow, TagManageRow };
export type {
	TagColorPickerProps,
	TagCreateRowProps,
	TagManageRowProps,
};
