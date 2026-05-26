/* jscpd:ignore-start */
import { FormModal } from "@renderer/components/FormModal";
import { Input, TextArea } from "@renderer/components/Input";
import { ManageTagsModal } from "@renderer/components/modals/ManageTagsModal";
import { TagPicker } from "@renderer/components/TagPicker";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { entityBus } from "@renderer/lib/entity-bus";
import { useTaskInvalidation } from "@renderer/lib/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
/* jscpd:ignore-end */

type Props = {
	folderId: string;
	onClose: () => void;
};

export function CreateTaskModal({ folderId, onClose }: Props) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [manageOpen, setManageOpen] = useState(false);
	const invalidate = useTaskInvalidation();
	const toast = useToast();
	const tagsQuery = useQuery(orpc.tags.list.queryOptions());
	const tagNameById = new Map(
		(tagsQuery.data ?? []).map((t) => [t.id, t.name]),
	);

	const create = useMutation(
		orpc.tasks.create.mutationOptions({
			onSuccess: (task) => {
				invalidate();
				toast.push("ok", `APPENDED // ${task.title}`);
				const taskTags = task.tagIds
					.map((id) => tagNameById.get(id))
					.filter((n): n is string => !!n);
				entityBus.emit("task:created", {
					taskTitle: task.title,
					...(taskTags.length > 0 ? { taskTags } : {}),
				});
				onClose();
			},
			onError: () => toast.push("err", "APPEND FAILED"),
		}),
	);

	const trimmedTitle = title.trim();
	const trimmedDesc = description.trim();

	return (
		<>
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
					...(tagIds.length > 0 ? { tagIds } : {}),
				})
			}
		>
			{/* jscpd:ignore-start */}
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
			<TagPicker
				selectedIds={tagIds}
				onChange={setTagIds}
				onManageClick={() => setManageOpen(true)}
			/>
			{/* jscpd:ignore-end */}
		</FormModal>
		{manageOpen && <ManageTagsModal onClose={() => setManageOpen(false)} />}
		</>
	);
}
