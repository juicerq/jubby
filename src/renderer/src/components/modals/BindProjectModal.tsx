import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@renderer/components/Button";
import { FormModal } from "@renderer/components/FormModal";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";

type Props = {
	id: string;
	name: string;
	current?: string;
	onClose: () => void;
};

export function BindProjectModal({ id, name, current, onClose }: Props) {
	const [path, setPath] = useState<string | undefined>(current);
	const queryClient = useQueryClient();
	const toast = useToast();

	const { mutate: pickDirectory, isPending: isPicking } = useMutation(
		orpc.system.pickDirectory.mutationOptions({
			onSuccess: (result) => {
				if (result.path) {
					setPath(result.path);
				}
			},
			onError: () => toast.push("err", "FALHA AO ABRIR SELETOR"),
		}),
	);

	const { data: inspection, isFetching: isInspecting } = useQuery(
		orpc.system.inspectProject.queryOptions({
			input: { projectPath: path ?? "" },
			enabled: !!path,
		}),
	);

	const { mutate: bind, isPending: isBinding } = useMutation(
		orpc.folders.bindProject.mutationOptions({
			onSuccess: (folder) => {
				queryClient.invalidateQueries({ queryKey: orpc.folders.list.key() });
				toast.push("ok", `VINCULADO // ${folder.name}`);
				onClose();
			},
			onError: (err) =>
				toast.push("err", err.message || "FALHA AO VINCULAR PROJETO"),
		}),
	);

	const changed = path !== current;

	return (
		<FormModal
			onClose={onClose}
			title="BIND PROJECT"
			width="md"
			submitLabel="COMMIT"
			canSubmit={!!path && changed}
			isPending={isBinding}
			onSubmit={() => path && bind({ id, projectPath: path })}
		>
			<div className="type-mono-data text-fg-muted">
				&gt; Vincular projeto à pasta '{name}'.
			</div>

			<Button
				variant="ghost"
				onClick={() => pickDirectory({})}
				loading={isPicking}
			>
				SELECT DIRECTORY...
			</Button>

			{!!path && (
				<div className="flex flex-col gap-1">
					<span className="type-ui-label text-fg-muted">PATH</span>
					<span className="type-mono-data break-all text-fg">{path}</span>
				</div>
			)}

			{!!path && (
				<BindProjectFeedback
					loading={isInspecting && !inspection}
					inspection={inspection}
				/>
			)}
		</FormModal>
	);
}

type Inspection = {
	exists: boolean;
	hasGrillDir: boolean;
	grillCount: number;
};

function BindProjectFeedback({
	loading,
	inspection,
}: {
	loading: boolean;
	inspection?: Inspection;
}) {
	if (loading || !inspection) {
		return (
			<span className="type-mono-data text-fg-muted">&gt; verificando...</span>
		);
	}

	if (!inspection.exists) {
		return (
			<span className="type-mono-data text-error">
				&gt; DIRETÓRIO NÃO ENCONTRADO
			</span>
		);
	}

	if (!inspection.hasGrillDir) {
		return (
			<span className="type-mono-data text-fg-muted">
				&gt; SEM grill/ NESTE PROJETO
			</span>
		);
	}

	const plural = inspection.grillCount === 1 ? "" : "S";

	return (
		<span className="type-mono-data text-accent">
			&gt; grill/ OK // {inspection.grillCount} GRILL{plural}
		</span>
	);
}
