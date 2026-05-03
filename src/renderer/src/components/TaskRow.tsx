import { ConfirmAction } from "@renderer/components/ConfirmAction";
import { DropdownMenu } from "@renderer/components/DropdownMenu";
import { DeleteTaskModal } from "@renderer/components/modals/DeleteTaskModal";
import { EditTaskModal } from "@renderer/components/modals/EditTaskModal";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import { entityBus } from "@renderer/lib/entity-bus";
import { shortHash } from "@renderer/lib/now";
import { useTaskInvalidation } from "@renderer/lib/queries";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const COMPLETE_ANIM_MS = 500;

type TaskRowProps = {
	id: string;
	title: string;
	description?: string;
	done: boolean;
	folderBadge?: string;
	ageLabel?: string;
};

type ModalState = { kind: "none" } | { kind: "edit" } | { kind: "delete" };

export function TaskRow({
	id,
	title,
	description,
	done,
	folderBadge,
	ageLabel,
}: TaskRowProps) {
	const [modal, setModal] = useState<ModalState>({ kind: "none" });
	const [completing, setCompleting] = useState(false);
	const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const invalidate = useTaskInvalidation();
	const toast = useToast();

	const toggle = useMutation(
		orpc.tasks.toggleDone.mutationOptions({
			onSuccess: (task) => {
				invalidate();
				toast.push(
					"ok",
					task.done ? `DONE // ${task.title}` : `REOPEN // ${task.title}`,
				);
				if (task.done) {
					entityBus.emit("task:completed", {
						taskTitle: task.title,
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
					"group flex items-center gap-3 border-b border-border px-6 py-3 transition-all duration-300",
					visualDone ? "opacity-50" : "hover:bg-surface-2",
				)}
			>
				<span className={cn("inline-flex", completing && "task-checkbox-pop")}>
					<ConfirmAction
						mode="two-step"
						checked={visualDone}
						onConfirm={handleConfirm}
					/>
				</span>
				<span className="type-mono-data w-12 shrink-0 text-fg-dim">
					#{shortHash(id)}
				</span>
				<div className="flex flex-1 flex-col gap-0.5 truncate">
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
				</div>
				{!!folderBadge && (
					<span className="type-mono-data text-fg-dim">[ {folderBadge} ]</span>
				)}
				{!!ageLabel && (
					<span className="type-mono-data text-accent-dim">{ageLabel}</span>
				)}
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
					onClose={close}
				/>
			)}
			{modal.kind === "delete" && (
				<DeleteTaskModal id={id} title={title} onClose={close} />
			)}
		</>
	);
}
