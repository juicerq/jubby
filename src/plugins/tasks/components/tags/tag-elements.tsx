import { Check, Tag, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "../../hooks/use-click-outside";
import type { Tag as TagType } from "../../types";

interface TagBadgeProps {
	tag: TagType;
	isCompleted?: boolean;
}

function TagBadge({ tag, isCompleted = false }: TagBadgeProps) {
	return (
		<span
			className={`inline-flex max-w-[80px] items-center truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight tracking-[-0.01em] transition-opacity duration-150 ease-out ${
				isCompleted ? "opacity-40" : "opacity-100"
			}`}
			style={{
				backgroundColor: `${tag.color}20`,
				color: tag.color,
			}}
			title={tag.name}
		>
			{tag.name}
		</span>
	);
}

interface TagButtonProps {
	onClick: () => void;
	small?: boolean;
}

function TagButton({ onClick, small }: TagButtonProps) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			className={cn(
				"group flex shrink-0 cursor-pointer items-center justify-center border border-transparent transition-all duration-180ms ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
				small
					? "h-8 w-8 rounded-md bg-white/4"
					: "h-10 w-10 rounded-[10px] bg-white/4",
			)}
			aria-label="Manage tags"
			title="Manage tags"
		>
			<Tag
				className={cn(
					"text-white/40 transition-colors duration-180ms ease-out group-hover:text-white/70",
					small ? "h-3.5 w-3.5" : "h-4 w-4",
				)}
			/>
		</button>
	);
}

interface TagSelectorProps {
	tags: TagType[];
	selectedTagIds: string[];
	onToggleTag: (tagId: string) => void;
}

function TagSelector({ tags, selectedTagIds, onToggleTag }: TagSelectorProps) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{tags.map((tag) => {
				const isSelected = selectedTagIds.includes(tag.id);

				return (
					<button
						key={tag.id}
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggleTag(tag.id);
						}}
						className="inline-flex cursor-pointer items-center rounded px-2 py-1 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						style={{
							backgroundColor: `${tag.color}${isSelected ? "50" : "20"}`,
							color: tag.color,
						}}
						title={
							isSelected ? `Remove ${tag.name} filter` : `Filter by ${tag.name}`
						}
					>
						{tag.name}
					</button>
				);
			})}
		</div>
	);
}

interface TagEditorPopoverProps {
	tags: TagType[];
	selectedTagIds: string[];
	onToggleTag: (tagId: string) => void;
	onClose: () => void;
}

function TagEditorPopover({
	tags,
	selectedTagIds,
	onToggleTag,
	onClose,
}: TagEditorPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);

	useClickOutside(popoverRef, onClose);

	return (
		<div
			ref={popoverRef}
			className="absolute left-0 top-full z-10 mt-1 flex w-[280px] flex-col rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
				<span className="text-[11px] font-medium text-white/50">Tags</span>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onClose();
					}}
					className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					aria-label="Close"
				>
					<X className="h-3 w-3" />
				</button>
			</div>

			<div className="grid grid-cols-3 gap-1.5 p-2">
				{tags.map((tag) => {
					const isSelected = selectedTagIds.includes(tag.id);

					return (
						<button
							key={tag.id}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onToggleTag(tag.id);
							}}
							className={`flex cursor-pointer items-center justify-center gap-1 truncate rounded px-2 py-1.5 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] ${
								isSelected ? "ring-1 ring-white/30" : ""
							}`}
							style={{
								backgroundColor: `${tag.color}${isSelected ? "40" : "20"}`,
								color: tag.color,
							}}
							title={isSelected ? `Remove ${tag.name}` : `Add ${tag.name}`}
						>
							{isSelected && <Check className="h-3 w-3 shrink-0" />}
							<span className="truncate">{tag.name}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export { TagBadge, TagButton, TagEditorPopover, TagSelector };
export type {
	TagBadgeProps,
	TagButtonProps,
	TagEditorPopoverProps,
	TagSelectorProps,
};
