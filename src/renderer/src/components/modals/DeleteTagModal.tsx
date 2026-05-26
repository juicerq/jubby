import { Button } from "@renderer/components/Button";
import { ConfirmAction } from "@renderer/components/ConfirmAction";
import { Modal } from "@renderer/components/Modal";
import { TagChip } from "@renderer/components/TagChip";
import type { TagColor } from "@renderer/constants/tag-colors";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { useTagInvalidation } from "@renderer/lib/queries";
import { useMutation } from "@tanstack/react-query";

type Props = {
	id: string;
	name: string;
	color: TagColor;
	taskCount: number;
	onClose: () => void;
};

function tasksLabel(count: number): string {
	return `${count} ${count === 1 ? "task" : "tasks"}`;
}

export function DeleteTagModal({
	id,
	name,
	color,
	taskCount,
	onClose,
}: Props) {
	const invalidate = useTagInvalidation();
	const toast = useToast();
	const countLabel = tasksLabel(taskCount);

	const remove = useMutation(
		orpc.tags.delete.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.push("ok", `PURGED // ${name}`);
				onClose();
			},
			onError: () => toast.push("err", "PURGE FAILED"),
		}),
	);

	return (
		<Modal
			open
			onClose={onClose}
			title="PURGE TAG"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						ABORT
					</Button>
					{taskCount === 0 && (
						<Button variant="danger" onClick={() => remove.mutate({ id })}>
							PURGE
						</Button>
					)}
					{taskCount > 0 && (
						<ConfirmAction
							mode="timed"
							label="PURGE"
							durationMs={3000}
							onConfirm={() => remove.mutate({ id })}
						/>
					)}
				</>
			}
		>
			<p className="type-body-md text-fg-muted">
				This will untag {countLabel} and remove the tag.
			</p>
			<div className="flex items-center gap-2">
				<TagChip name={name} color={color} />
				<span className="type-mono-data text-fg-dim">{countLabel}</span>
			</div>
		</Modal>
	);
}
