import { TagChip } from "@renderer/components/TagChip";
import type { TagColor } from "@renderer/constants/tag-colors";
import { orpc } from "@renderer/lib/api";
import { useQuery } from "@tanstack/react-query";

type Tag = { id: string; name: string; color: TagColor };

type TagFilterBarProps = {
	selectedIds: string[];
	onToggle: (id: string) => void;
	onClear: () => void;
};

export function TagFilterBar({
	selectedIds,
	onToggle,
	onClear,
}: TagFilterBarProps) {
	const tags = useQuery(orpc.tags.list.queryOptions());
	const all = (tags.data ?? []) as Tag[];

	if (all.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
			<span className="type-ui-label text-fg-muted">FILTER //</span>
			{all.map((tag) => (
				<TagChip
					key={tag.id}
					name={tag.name}
					color={tag.color}
					active={selectedIds.includes(tag.id)}
					onClick={() => onToggle(tag.id)}
				/>
			))}
			{selectedIds.length > 0 && (
				<button
					type="button"
					onClick={onClear}
					className="type-mono-data text-fg-dim hover:text-accent cursor-pointer"
				>
					[clear]
				</button>
			)}
		</div>
	);
}
