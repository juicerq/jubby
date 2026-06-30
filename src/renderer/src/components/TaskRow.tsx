import { ConfirmAction } from "@renderer/components/ConfirmAction";
import { DropdownMenu } from "@renderer/components/DropdownMenu";
import { DeleteTaskModal } from "@renderer/components/modals/DeleteTaskModal";
import { EditTaskModal } from "@renderer/components/modals/EditTaskModal";
import { TagChip } from "@renderer/components/TagChip";
import { useToast } from "@renderer/components/Toast";
import type { TagColor } from "@renderer/constants/tag-colors";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import { entityBus } from "@renderer/lib/entity-bus";
import { shortHash } from "@renderer/lib/now";
import { useTaskInvalidation } from "@renderer/lib/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const COMPLETE_ANIM_MS = 500;

type TaskRowProps = {
	id: string;
	title: string;
	description?: string;
	done: boolean;
	tagIds: string[];
};

type ModalState = { kind: "none" } | { kind: "edit" } | { kind: "delete" };

type TagSummary = { id: string; name: string; color: TagColor };

export function TaskRow({
	id,
	title,
	description,
	done,
	tagIds,
}: TaskRowProps) {
	const [modal, setModal] = useState<ModalState>({ kind: "none" });
	const [completing, setCompleting] = useState(false);
	const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const invalidate = useTaskInvalidation();
	const toast = useToast();
	const tags = useQuery(orpc.tags.list.queryOptions());
	const tagById = new Map(
		((tags.data ?? []) as TagSummary[]).map((t) => [t.id, t]),
	);
	const resolvedTags = tagIds
		.map((tid) => tagById.get(tid))
		.filter((t): t is TagSummary => !!t);

	const toggle = useMutation(
		orpc.tasks.toggleDone.mutationOptions({
			onSuccess: (task) => {
				invalidate();
				toast.push(
					"ok",
					task.done ? `DONE // ${task.title}` : `REOPEN // ${task.title}`,
				);
				if (task.done) {
					const taskTags = task.tagIds
						.map((tid) => tagById.get(tid)?.name)
						.filter((n): n is string => !!n);
					entityBus.emit("task:completed", {
						taskTitle: task.title,
						...(taskTags.length > 0 ? { taskTags } : {}),
					});
				}
			},
			onError: () => {
				setCompleting(false);
				toast.push("err", "TOGGLE FAILED");
			},
		}),
	);

	// Pending completion timer is an external resource; clear on unmount.
	useEffect(() => {
		return () => {
			if (completeTimerRef.current) {
				clearTimeout(completeTimerRef.current);
			}
		};
	}, []);

	const close = () => setModal({ kind: "none" });

	const handleConfirm = () => {
		if (done) {
			toggle.mutate({ id });
			return;
		}

		setCompleting(true);
		completeTimerRef.current = setTimeout(() => {
			completeTimerRef.current = null;
			toggle.mutate({ id });
		}, COMPLETE_ANIM_MS);
	};

	const visualDone = done || completing;

	return (
		<>
			<div
				className={cn(
					"group flex items-start gap-3 border-b border-border px-6 py-3 transition-all duration-300",
					visualDone ? "opacity-50" : "hover:bg-surface-2",
				)}
			>
				<span
					className={cn(
						"inline-flex pt-0.5",
						completing && "task-checkbox-pop",
					)}
				>
					<ConfirmAction
						mode="two-step"
						checked={visualDone}
						onConfirm={handleConfirm}
					/>
				</span>
				<span className="type-mono-data w-12 shrink-0 pt-0.5 text-fg-dim">
					#{shortHash(id)}
				</span>
				<div className="flex flex-1 flex-col gap-1 truncate">
					<span
						className={cn(
							"type-task-title text-fg",
							visualDone && "line-through text-fg-muted",
							completing && "task-complete-flash",
						)}
					>
						{title}
					</span>
					{!!description && (
						<span className="type-body-md truncate text-fg-muted">
							{description}
						</span>
					)}
					{resolvedTags.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							{resolvedTags.map((tag) => (
								<TagChip key={tag.id} name={tag.name} color={tag.color} />
							))}
						</div>
					)}
				</div>
				<DropdownMenu
					aria-label="Task actions"
					items={[
						{
							label: "Edit",
							icon: <Pencil size={12} />,
							onSelect: () => setModal({ kind: "edit" }),
						},
						{
							label: "Purge",
							icon: <Trash2 size={12} />,
							onSelect: () => setModal({ kind: "delete" }),
							danger: true,
						},
					]}
				/>
			</div>

			{modal.kind === "edit" && (
				<EditTaskModal
					id={id}
					currentTitle={title}
					currentDescription={description}
					currentTagIds={tagIds}
					onClose={close}
				/>
			)}
			{modal.kind === "delete" && (
				<DeleteTaskModal id={id} title={title} onClose={close} />
			)}
		</>
	);
}
