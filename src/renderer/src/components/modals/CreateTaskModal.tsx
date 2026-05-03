import { FormModal } from "@renderer/components/FormModal";
import { Input, TextArea } from "@renderer/components/Input";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { entityBus } from "@renderer/lib/entity-bus";
import { useTaskInvalidation } from "@renderer/lib/queries";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

type Props = {
	folderId: string;
	onClose: () => void;
};

export function CreateTaskModal({ folderId, onClose }: Props) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const invalidate = useTaskInvalidation();
	const toast = useToast();

	const create = useMutation(
		orpc.tasks.create.mutationOptions({
			onSuccess: (task) => {
				invalidate();
				toast.push("ok", `APPENDED // ${task.title}`);
				entityBus.emit("task:created", { taskTitle: task.title });
				onClose();
			},
			onError: () => toast.push("err", "APPEND FAILED"),
		}),
	);

	const trimmedTitle = title.trim();
	const trimmedDesc = description.trim();

	return (
		<FormModal
			onClose={onClose}
			title="INITIALIZE NEW TASK_PROTOCOL"
			width="md"
			submitLabel="APPEND"
			canSubmit={!!trimmedTitle}
			isPending={create.isPending}
			onSubmit={() =>
				create.mutate({
					folderId,
					title: trimmedTitle,
					...(trimmedDesc ? { description: trimmedDesc } : {}),
				})
			}
		>
			<Input
				name="title"
				label="DESIGNATION"
				autoFocus
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				placeholder="e.g. Refactor auth"
				className="type-task-title"
			/>
			<TextArea
				name="description"
				label="MANIFEST"
				rows={4}
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				placeholder="Optional notes..."
			/>
		</FormModal>
	);
}
