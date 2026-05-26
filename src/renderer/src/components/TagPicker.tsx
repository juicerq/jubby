import { TagChip } from "@renderer/components/TagChip";
import { TagColorPicker } from "@renderer/components/TagColorPicker";
import { useToast } from "@renderer/components/Toast";
import type { TagColor } from "@renderer/constants/tag-colors";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import { useTagInvalidation } from "@renderer/lib/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

const MAX_TAGS = 5;
const DEFAULT_NEW_COLOR: TagColor = "green";

type Tag = {
	id: string;
	name: string;
	color: TagColor;
};

type Option = { kind: "tag"; tag: Tag } | { kind: "create" };

type TagPickerProps = {
	selectedIds: string[];
	onChange: (ids: string[]) => void;
	onManageClick?: () => void;
};

export function TagPicker({
	selectedIds,
	onChange,
	onManageClick,
}: TagPickerProps) {
	const [input, setInput] = useState("");
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const [newColor, setNewColor] = useState<TagColor>(DEFAULT_NEW_COLOR);
	const tags = useQuery(orpc.tags.list.queryOptions());
	const invalidateTags = useTagInvalidation();
	const toast = useToast();

	const create = useMutation(
		orpc.tags.create.mutationOptions({
			onSuccess: (tag) => {
				invalidateTags();

				if (selectedIds.includes(tag.id)) {
					return;
				}

				if (selectedIds.length >= MAX_TAGS) {
					toast.push("err", `máximo ${MAX_TAGS} tags por task`);
					return;
				}

				onChange([...selectedIds, tag.id]);
				setInput("");
				setActive(0);
				setNewColor(DEFAULT_NEW_COLOR);
			},
			onError: (err) => toast.push("err", String(err)),
		}),
	);

	const allTags = (tags.data ?? []) as Tag[];
	const tagById = new Map(allTags.map((t) => [t.id, t]));
	const selected = selectedIds
		.map((id) => tagById.get(id))
		.filter((t): t is Tag => !!t);

	const query = input.trim();
	const queryKey = query.toLocaleLowerCase("pt-BR");
	const available = allTags.filter(
		(t) =>
			!selectedIds.includes(t.id) &&
			(queryKey.length === 0
				? true
				: t.name.toLocaleLowerCase("pt-BR").includes(queryKey)),
	);
	const exactMatch = allTags.find(
		(t) => t.name.toLocaleLowerCase("pt-BR") === queryKey,
	);
	const canCreate = query.length > 0 && !exactMatch;
	const atLimit = selectedIds.length >= MAX_TAGS;

	const options: Option[] = [
		...available.map((tag): Option => ({ kind: "tag", tag })),
		...(canCreate ? [{ kind: "create" } as Option] : []),
	];
	const activeIndex = options.length === 0 ? -1 : Math.min(active, options.length - 1);
	const showDropdown = open && (options.length > 0 || !!onManageClick);

	const addExisting = (id: string) => {
		if (atLimit) {
			toast.push("err", `máximo ${MAX_TAGS} tags por task`);
			return;
		}

		if (selectedIds.includes(id)) {
			return;
		}

		onChange([...selectedIds, id]);
		setInput("");
		setActive(0);
	};

	const remove = (id: string) => {
		onChange(selectedIds.filter((sid) => sid !== id));
	};

	const submitCreate = () => {
		if (atLimit) {
			toast.push("err", `máximo ${MAX_TAGS} tags por task`);
			return;
		}

		if (exactMatch) {
			addExisting(exactMatch.id);
			return;
		}

		if (canCreate) {
			create.mutate({ name: query, color: newColor });
		}
	};

	const commitOption = (option: Option) => {
		if (option.kind === "create") {
			submitCreate();
			return;
		}

		addExisting(option.tag.id);
	};

	return (
		<div className="flex flex-col gap-1">
			<label
				htmlFor="tag-picker-input"
				className="type-ui-label text-fg-muted flex items-center gap-2"
			>
				<span>TAGS</span>
				<span className="flex items-center gap-0.5" aria-hidden>
					{Array.from({ length: MAX_TAGS }, (_, i) => (
						<span
							key={i}
							className={cn(
								"h-2 w-1",
								i < selectedIds.length ? "bg-accent" : "bg-fg-dim",
							)}
						/>
					))}
				</span>
				<span className="type-mono-data text-fg-dim">
					{selectedIds.length}/{MAX_TAGS}
				</span>
			</label>

			<div className="relative">
				<div
					className={cn(
						"bg-surface-3 border transition-colors px-2 py-1.5 flex flex-wrap items-center gap-1",
						open ? "border-accent" : "border-border",
					)}
				>
					<span
						className={cn(
							"type-mono-data select-none",
							open ? "text-accent" : "text-fg-dim",
						)}
						aria-hidden
					>
						&gt;
					</span>
					{selected.map((tag) => (
						<TagChip
							key={tag.id}
							name={tag.name}
							color={tag.color}
							onRemove={() => remove(tag.id)}
						/>
					))}
					<input
						id="tag-picker-input"
						value={input}
						onChange={(e) => {
							setInput(e.target.value);
							setActive(0);
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => setOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown" && options.length > 0) {
								e.preventDefault();
								setActive((i) => (i + 1) % options.length);
								return;
							}

							if (e.key === "ArrowUp" && options.length > 0) {
								e.preventDefault();
								setActive((i) => (i - 1 + options.length) % options.length);
								return;
							}

							if (e.key === "Enter") {
								e.preventDefault();
								const option = options[activeIndex];

								if (option) {
									commitOption(option);
								}

								return;
							}

							if (
								e.key === "Backspace" &&
								input.length === 0 &&
								selected.length > 0
							) {
								e.preventDefault();
								const last = selected.at(-1);

								if (last) {
									remove(last.id);
								}

								return;
							}

							if (e.key === "Escape") {
								setOpen(false);
								(e.target as HTMLInputElement).blur();
							}
						}}
						placeholder={
							atLimit
								? `máximo ${MAX_TAGS} tags`
								: selected.length === 0
									? "buscar ou criar tag..."
									: ""
						}
						disabled={atLimit}
						className="type-body-md bg-transparent flex-1 min-w-[80px] outline-none text-fg placeholder:text-fg-dim disabled:cursor-not-allowed"
					/>
				</div>

				{showDropdown && (
					<div
						className={cn(
							"absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto",
							"bg-surface-2 border border-accent/40 shadow-xl",
						)}
					>
						<div className="flex items-center justify-between border-b border-border px-2 py-1">
							<span className="type-ui-label text-fg-dim">// TAG_REGISTRY</span>
							{options.length > 0 && (
								<span className="type-mono-data text-fg-dim">↑↓ ENTER</span>
							)}
						</div>

						{available.length > 0 && (
							<div className="flex flex-wrap gap-1 p-2">
								{available.map((tag, i) => (
									<button
										key={tag.id}
										type="button"
										onMouseEnter={() => setActive(i)}
										onMouseDown={(e) => {
											e.preventDefault();
											addExisting(tag.id);
										}}
										className="cursor-pointer"
									>
										<TagChip
											name={tag.name}
											color={tag.color}
											active={i === activeIndex}
										/>
									</button>
								))}
							</div>
						)}

						{available.length === 0 && !canCreate && (
							<div className="type-mono-data text-fg-dim px-2 py-2">
								nenhuma tag // digite para criar
							</div>
						)}

						{canCreate && (
							<div
								onMouseEnter={() => setActive(options.length - 1)}
								className={cn(
									"border-t border-border px-2 py-1.5 flex items-center justify-between gap-2 transition-colors",
									activeIndex === options.length - 1 && "bg-surface-3",
								)}
							>
								<button
									type="button"
									onMouseDown={(e) => {
										e.preventDefault();
										submitCreate();
									}}
									disabled={create.isPending}
									className={cn(
										"type-mono-data cursor-pointer disabled:opacity-50 flex-1 text-left transition-colors",
										activeIndex === options.length - 1
											? "text-accent"
											: "text-fg-muted hover:text-accent",
									)}
								>
									[+] criar "{query}"
								</button>
								<TagColorPicker value={newColor} onChange={setNewColor} />
							</div>
						)}

						{!!onManageClick && (
							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault();
									onManageClick();
									setOpen(false);
								}}
								className="w-full border-t border-border px-2 py-1 text-right type-mono-data text-fg-dim hover:text-accent hover:bg-surface-3 cursor-pointer"
							>
								manage tags →
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
