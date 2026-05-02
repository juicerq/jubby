import { useMutation } from "@tanstack/react-query";
import { Button } from "@renderer/components/Button";
import { Modal } from "@renderer/components/Modal";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { useTaskInvalidation } from "@renderer/lib/queries";

type Props = {
	id: string;
	title: string;
	onClose: () => void;
};

export function DeleteTaskModal({ id, title, onClose }: Props) {
	const invalidate = useTaskInvalidation();
	const toast = useToast();

	const remove = useMutation(
		orpc.tasks.delete.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.push("ok", `PURGED // ${title}`);
				onClose();
			},
			onError: () => toast.push("err", "PURGE FAILED"),
		}),
	);

	return (
		<Modal
			open
			onClose={onClose}
			title="PURGE TASK"
			width="sm"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						ABORT
					</Button>
					<Button
						variant="danger"
						onClick={() => remove.mutate({ id })}
						loading={remove.isPending}
					>
						EXECUTE
					</Button>
				</>
			}
		>
			<div className="type-mono-data text-fg">
				&gt; Protocol '{title}' will be DESTROYED.
			</div>
		</Modal>
	);
}
