import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Button } from "@renderer/components/Button";
import { ConfirmAction } from "@renderer/components/ConfirmAction";
import { Modal } from "@renderer/components/Modal";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { useFolderInvalidation } from "@renderer/lib/queries";

type Props = {
	id: string;
	name: string;
	onClose: () => void;
};

export function PurgeFolderModal({ id, name, onClose }: Props) {
	const invalidate = useFolderInvalidation();
	const toast = useToast();
	const navigate = useNavigate();
	const params = useParams({ strict: false });
	const tasks = useQuery(
		orpc.tasks.listByFolder.queryOptions({ input: { folderId: id } }),
	);
	const taskCount = tasks.data?.length ?? 0;

	const remove = useMutation(
		orpc.folders.delete.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.push("ok", `PURGED // ${name}`);
				onClose();
				if (params.folderId === id) {
					navigate({ to: "/" });
				}
			},
			onError: () => toast.push("err", "PURGE FAILED"),
		}),
	);

	return (
		<Modal
			open
			onClose={onClose}
			title="DESTRUCTIVE OPERATION"
			width="md"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						ABORT
					</Button>
					<ConfirmAction
						label="EXECUTE"
						durationMs={3000}
						onConfirm={() => remove.mutate({ id })}
					/>
				</>
			}
		>
			<div className="type-mono-data flex flex-col gap-1 text-fg">
				<span>
					&gt; Directory '{name}' contains {taskCount} protocols.
				</span>
				<span className="text-error">
					&gt; All will be DESTROYED. Continue?
				</span>
			</div>
		</Modal>
	);
}
