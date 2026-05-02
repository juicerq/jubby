import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FormModal } from "@renderer/components/FormModal";
import { Input } from "@renderer/components/Input";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { useFolderInvalidation } from "@renderer/lib/queries";

export function CreateFolderModal({ onClose }: { onClose: () => void }) {
	const [name, setName] = useState("");
	const invalidate = useFolderInvalidation();
	const toast = useToast();

	const create = useMutation(
		orpc.folders.create.mutationOptions({
			onSuccess: (folder) => {
				invalidate();
				toast.push("ok", `INIT // ${folder.name}`);
				onClose();
			},
			onError: () => toast.push("err", "INIT FAILED"),
		}),
	);

	const trimmed = name.trim();

	return (
		<FormModal
			onClose={onClose}
			title="INIT NEW DIRECTORY"
			submitLabel="INIT"
			canSubmit={!!trimmed}
			isPending={create.isPending}
			onSubmit={() => create.mutate({ name: trimmed })}
		>
			<Input
				name="name"
				label="DESIGNATION"
				autoFocus
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="e.g. WORK"
			/>
		</FormModal>
	);
}
