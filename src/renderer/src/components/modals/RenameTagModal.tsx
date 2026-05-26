/* jscpd:ignore-start */
import { FormModal } from "@renderer/components/FormModal";
import { Input } from "@renderer/components/Input";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { useTagInvalidation } from "@renderer/lib/queries";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
/* jscpd:ignore-end */

type Props = {
	id: string;
	current: string;
	onClose: () => void;
};

export function RenameTagModal({ id, current, onClose }: Props) {
	const [name, setName] = useState(current);
	const invalidate = useTagInvalidation();
	const toast = useToast();

	const rename = useMutation(
		orpc.tags.rename.mutationOptions({
			onSuccess: (tag) => {
				invalidate();
				toast.push("ok", `RENAMED // ${tag.name}`);
				onClose();
			},
			onError: (err) => toast.push("err", String(err)),
		}),
	);

	const trimmed = name.trim();
	const changed = trimmed !== current;

	return (
		<FormModal
			onClose={onClose}
			title="RENAME TAG"
			submitLabel="COMMIT"
			canSubmit={!!trimmed && changed}
			isPending={rename.isPending}
			onSubmit={() => rename.mutate({ id, name: trimmed })}
		>
			{/* jscpd:ignore-start */}
			<Input
				name="name"
				label="DESIGNATION"
				autoFocus
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			{/* jscpd:ignore-end */}
		</FormModal>
	);
}
