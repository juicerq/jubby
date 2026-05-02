/* jscpd:ignore-start */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FormModal } from "@renderer/components/FormModal";
import { Input, TextArea } from "@renderer/components/Input";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { useTaskInvalidation } from "@renderer/lib/queries";
/* jscpd:ignore-end */

type Props = {
	id: string;
	currentTitle: string;
	currentDescription?: string;
	onClose: () => void;
};

export function EditTaskModal({
	id,
	currentTitle,
	currentDescription,
	onClose,
}: Props) {
	const [title, setTitle] = useState(currentTitle);
	const [description, setDescription] = useState(currentDescription ?? "");
	const invalidate = useTaskInvalidation();
	const toast = useToast();

	const update = useMutation(
		orpc.tasks.update.mutationOptions({
			onSuccess: (task) => {
				invalidate();
				toast.push("ok", `PATCHED // ${task.title}`);
				onClose();
			},
			onError: () => toast.push("err", "PATCH FAILED"),
		}),
	);

	const trimmedTitle = title.trim();
	const trimmedDesc = description.trim();
	const titleChanged = trimmedTitle !== currentTitle;
	const descChanged = trimmedDesc !== (currentDescription ?? "");

	return (
		<FormModal
			onClose={onClose}
			title="PATCH TASK_PROTOCOL"
			width="md"
			submitLabel="COMMIT"
			canSubmit={!!trimmedTitle && (titleChanged || descChanged)}
			isPending={update.isPending}
			onSubmit={() =>
				update.mutate({
					id,
					title: trimmedTitle,
					description: trimmedDesc,
				})
			}
		>
			<Input
				name="title"
				label="DESIGNATION"
				autoFocus
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				className="type-task-title"
			/>
			<TextArea
				name="description"
				label="MANIFEST"
				rows={4}
				value={description}
				onChange={(e) => setDescription(e.target.value)}
			/>
		</FormModal>
	);
}
