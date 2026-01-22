import { X } from "lucide-react";
import type { Tag as TagType } from "../../types";
import { TagCreateRow, TagManageRow } from "../tags/tag-management";

interface ManageTagsModalProps {
	tags: TagType[];
	onCreateTag: (name: string, color: string) => Promise<boolean>;
	onUpdateTag: (id: string, name: string, color: string) => Promise<boolean>;
	onDeleteTag: (id: string) => Promise<void>;
	onClose: () => void;
}

function ManageTagsModal({
	tags,
	onCreateTag,
	onUpdateTag,
	onDeleteTag,
	onClose,
}: ManageTagsModalProps) {
	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[360px] rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="manage-tags-title"
			>
				<div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
					<h2
						id="manage-tags-title"
						className="text-[14px] font-medium text-white/90"
					>
						Manage Tags
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

				<div className="p-3">
					<TagCreateRow onCreateTag={onCreateTag} />

					<div className="mt-3">
						<span className="text-[11px] font-medium tracking-wide text-white/40">
							Tags
						</span>
					</div>

					<div className="mt-2 max-h-[250px] overflow-y-auto">
						{tags.length === 0 ? (
							<div className="flex items-center justify-center py-8">
								<span className="text-[13px] text-white/35">No tags yet</span>
							</div>
						) : (
							<div className="grid grid-cols-2 gap-1">
								{tags.map((tag) => (
									<TagManageRow
										key={tag.id}
										tag={tag}
										allTags={tags}
										onUpdateTag={onUpdateTag}
										onDeleteTag={onDeleteTag}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export { ManageTagsModal };
export type { ManageTagsModalProps };
