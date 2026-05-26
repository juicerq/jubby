import { IconButton } from "@renderer/components/IconButton";
import { Modal } from "@renderer/components/Modal";
import { TagChip } from "@renderer/components/TagChip";
import { TagColorPicker } from "@renderer/components/TagColorPicker";
import type { TagColor } from "@renderer/constants/tag-colors";
import { DeleteTagModal } from "@renderer/components/modals/DeleteTagModal";
import { RenameTagModal } from "@renderer/components/modals/RenameTagModal";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import { useTagInvalidation } from "@renderer/lib/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

const DEFAULT_NEW_COLOR: TagColor = "green";

type Tag = {
	id: string;
	name: string;
	color: TagColor;
	taskCount: number;
};

type SubModal =
	| { kind: "none" }
	| { kind: "rename"; id: string; current: string }
	| { kind: "delete"; id: string; name: string; color: TagColor; count: number };

type Props = {
	onClose: () => void;
};

export function ManageTagsModal({ onClose }: Props) {
	const tags = useQuery(orpc.tags.list.queryOptions());
	const [sub, setSub] = useState<SubModal>({ kind: "none" });
	const closeSub = () => setSub({ kind: "none" });

	const all = (tags.data ?? []) as Tag[];

	return (
		<>
			<Modal open onClose={onClose} title="MANAGE TAGS" width="md">
				<CreateTagRow existing={all} />

				{all.length === 0 && (
					<p className="type-mono-data text-fg-dim">
						NO TAGS YET. Add one above.
					</p>
				)}
				{all.length > 0 && (
					<ul className="flex flex-col divide-y divide-border">
						{all.map((tag) => (
							<TagRow
								key={tag.id}
								tag={tag}
								onRename={() =>
									setSub({
										kind: "rename",
										id: tag.id,
										current: tag.name,
									})
								}
								onDelete={() =>
									setSub({
										kind: "delete",
										id: tag.id,
										name: tag.name,
										color: tag.color,
										count: tag.taskCount,
									})
								}
							/>
						))}
					</ul>
				)}
			</Modal>

			{sub.kind === "rename" && (
				<RenameTagModal id={sub.id} current={sub.current} onClose={closeSub} />
			)}
			{sub.kind === "delete" && (
				<DeleteTagModal
					id={sub.id}
					name={sub.name}
					color={sub.color}
					taskCount={sub.count}
					onClose={closeSub}
				/>
			)}
		</>
	);
}

function CreateTagRow({ existing }: { existing: Tag[] }) {
	const [name, setName] = useState("");
	const [color, setColor] = useState<TagColor>(DEFAULT_NEW_COLOR);
	const inputRef = useRef<HTMLInputElement>(null);
	const invalidate = useTagInvalidation();
	const toast = useToast();

	const create = useMutation(
		orpc.tags.create.mutationOptions({
			onSuccess: (tag) => {
				invalidate();
				toast.push("ok", `CREATED // ${tag.name}`);
				setName("");
				setColor(DEFAULT_NEW_COLOR);
				inputRef.current?.focus();
			},
			onError: (err) => toast.push("err", String(err)),
		}),
	);

	const trimmed = name.trim();
	const queryKey = trimmed.toLocaleLowerCase("pt-BR");
	const duplicate =
		trimmed.length > 0 &&
		existing.some((t) => t.name.toLocaleLowerCase("pt-BR") === queryKey);
	const canCreate = trimmed.length > 0 && !duplicate && !create.isPending;

	const submit = () => {
		if (!canCreate) {
			return;
		}

		create.mutate({ name: trimmed, color });
	};

	return (
		<form
			className="flex flex-col gap-1"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label
				htmlFor="create-tag-input"
				className="type-ui-label text-fg-muted"
			>
				NEW TAG
			</label>

			<div className="flex items-center gap-2 bg-surface-3 border border-border focus-within:border-accent transition-colors px-2 py-1.5">
				<span aria-hidden className="type-mono-data text-fg-dim">
					{">"}
				</span>
				<input
					id="create-tag-input"
					ref={inputRef}
					value={name}
					maxLength={32}
					autoFocus
					onChange={(e) => setName(e.target.value)}
					placeholder="designation..."
					className="type-body-md bg-transparent flex-1 min-w-0 outline-none text-fg placeholder:text-fg-dim"
				/>
				<TagColorPicker value={color} onChange={setColor} />
				<IconButton
					type="submit"
					aria-label="Create tag"
					disabled={!canCreate}
					className={cn(canCreate && "text-accent")}
				>
					[+]
				</IconButton>
			</div>

			<div className="flex items-center gap-2 min-h-5">
				{duplicate && (
					<span className="type-mono-data text-error">
						already exists: {trimmed}
					</span>
				)}
				{!duplicate && trimmed.length > 0 && (
					<>
						<span className="type-mono-data text-fg-dim">preview</span>
						<TagChip name={trimmed} color={color} />
					</>
				)}
			</div>
		</form>
	);
}

function TagRow({
	tag,
	onRename,
	onDelete,
}: {
	tag: Tag;
	onRename: () => void;
	onDelete: () => void;
}) {
	const invalidate = useTagInvalidation();
	const toast = useToast();

	const recolor = useMutation(
		orpc.tags.recolor.mutationOptions({
			onSuccess: () => invalidate(),
			onError: () => toast.push("err", "RECOLOR FAILED"),
		}),
	);

	const handleColor = (color: TagColor) => {
		if (color === tag.color) {
			return;
		}

		recolor.mutate({ id: tag.id, color });
	};

	return (
		<li className="flex items-center gap-3 py-2">
			<div className="flex-1 min-w-0">
				<TagChip name={tag.name} color={tag.color} size="md" />
			</div>
			<span className="type-mono-data text-fg-dim w-20 text-right">
				{`${tag.taskCount} ${tag.taskCount === 1 ? "task" : "tasks"}`}
			</span>
			<TagColorPicker value={tag.color} onChange={handleColor} />
			<IconButton aria-label="Rename" onClick={onRename}>
				<Pencil size={14} />
			</IconButton>
			<IconButton aria-label="Purge" onClick={onDelete}>
				<Trash2 size={14} />
			</IconButton>
		</li>
	);
}
