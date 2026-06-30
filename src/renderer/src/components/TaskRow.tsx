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
import { type TaskStatus, taskStatus } from "@shared/task-status";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const COMPLETE_ANIM_MS = 500;

type TaskRowProps = {
	id: string;
	title: string;
	description?: string;
	status: TaskStatus;
	tagIds: string[];
};

function statusGlyph(status: TaskStatus): string {
	if (status === "done") {
		return "[x]";
	}

	if (status === "ongoing") {
		return "[>]";
	}

	return "[ ]";
}

function nextActionLabel(status: TaskStatus): string {
	if (status === "done") {
		return "Reabrir task";
	}

	if (status === "ongoing") {
		return "Concluir task";
	}

	return "Iniciar task";
}

function titleColor(status: TaskStatus, visualDone: boolean): string {
	if (visualDone) {
		return "text-fg-muted";
	}

	if (status === "ongoing") {
		return "text-accent";
	}

	return "text-fg";
}

type ModalState = { kind: "none" } | { kind: "edit" } | { kind: "delete" };

type TagSummary = { id: string; name: string; color: TagColor };

export function TaskRow({
	id,
	title,
	description,
	status,
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

	const cycle = useMutation(
		orpc.tasks.cycleStatus.mutationOptions({
			onSuccess: (task) => {
				invalidate();
				const result = taskStatus(task);

				if (result === "ongoing") {
					toast.push("ok", `ONGOING // ${task.title}`);
					return;
				}

				if (result === "todo") {
					toast.push("ok", `REOPEN // ${task.title}`);
					return;
				}

				toast.push("ok", `DONE // ${task.title}`);
				const taskTags = task.tagIds
					.map((tid) => tagById.get(tid)?.name)
					.filter((n): n is string => !!n);
				entityBus.emit("task:completed", {
					taskTitle: task.title,
					...(taskTags.length > 0 ? { taskTags } : {}),
				});
			},
			onError: () => {
				setCompleting(false);
				toast.push("err", `FALHA // ${title}`);
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

	const handleClick = () => {
		if (completing) {
			return;
		}

		if (status === "ongoing") {
			setCompleting(true);
			completeTimerRef.current = setTimeout(() => {
				completeTimerRef.current = null;
				cycle.mutate({ id });
			}, COMPLETE_ANIM_MS);
			return;
		}

		cycle.mutate({ id });
	};

	const visualDone = status === "done" || completing;
	const isOngoing = status === "ongoing";
	const glyph = completing ? "[x]" : statusGlyph(status);

	return (
		<>
			<div
				className={cn(
					"group flex items-start gap-3 border-b border-border px-6 py-3 transition-all duration-300",
					visualDone && "opacity-50",
					isOngoing && "border-l-2 border-l-accent bg-accent-dim/20",
					!visualDone && !isOngoing && "hover:bg-surface-2",
				)}
			>
				<span
					className={cn(
						"inline-flex pt-0.5",
						completing && "task-checkbox-pop",
					)}
				>
					<button
						type="button"
						aria-label={nextActionLabel(status)}
						onClick={handleClick}
						className={cn(
							"type-mono-data inline-flex h-5 min-w-[28px] items-center justify-center transition-colors cursor-pointer",
							visualDone ? "text-fg-muted" : "text-fg-muted hover:text-accent",
						)}
					>
						{glyph}
					</button>
				</span>
				<span className="type-mono-data w-12 shrink-0 pt-0.5 text-fg-dim">
					#{shortHash(id)}
				</span>
				<div className="flex flex-1 flex-col gap-1 truncate">
					<span
						className={cn(
							"type-task-title",
							titleColor(status, visualDone),
							visualDone && "line-through",
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
					{(isOngoing || resolvedTags.length > 0) && (
						<div className="flex flex-wrap items-center gap-2">
							{isOngoing && (
								<span className="type-ui-label inline-flex items-center border border-accent px-1.5 py-0.5 text-accent">
									▶ ONGOING
								</span>
							)}
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
