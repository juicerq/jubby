import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FormModal } from "@renderer/components/FormModal";
import { Input } from "@renderer/components/Input";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";

type Props = {
	id: string;
	current: string;
	onClose: () => void;
};

export function RenameFolderModal({ id, current, onClose }: Props) {
	const [name, setName] = useState(current);
	const queryClient = useQueryClient();
	const toast = useToast();

	const rename = useMutation(
		orpc.folders.rename.mutationOptions({
			onSuccess: (folder) => {
				queryClient.invalidateQueries({ queryKey: orpc.folders.list.key() });
				toast.push("ok", `RENAMED // ${folder.name}`);
				onClose();
			},
			onError: () => toast.push("err", "RENAME FAILED"),
		}),
	);

	const trimmed = name.trim();
	const changed = trimmed !== current;

	return (
		<FormModal
			onClose={onClose}
			title="RENAME DIRECTORY"
			submitLabel="COMMIT"
			canSubmit={!!trimmed && changed}
			isPending={rename.isPending}
			onSubmit={() => rename.mutate({ id, name: trimmed })}
		>
			<Input
				name="name"
				label="DESIGNATION"
				autoFocus
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
		</FormModal>
	);
}
