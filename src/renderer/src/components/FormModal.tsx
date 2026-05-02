import type { ReactNode } from "react";
import { Button } from "@renderer/components/Button";
import { Modal } from "@renderer/components/Modal";

type FormModalProps = {
	onClose: () => void;
	title: string;
	width?: "sm" | "md";
	submitLabel: string;
	canSubmit: boolean;
	isPending: boolean;
	onSubmit: () => void;
	children: ReactNode;
};

export function FormModal({
	onClose,
	title,
	width = "sm",
	submitLabel,
	canSubmit,
	isPending,
	onSubmit,
	children,
}: FormModalProps) {
	return (
		<Modal
			open
			onClose={onClose}
			title={title}
			width={width}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						ABORT
					</Button>
					<Button onClick={onSubmit} disabled={!canSubmit || isPending}>
						{submitLabel}
					</Button>
				</>
			}
		>
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();

					if (canSubmit && !isPending) {
						onSubmit();
					}
				}}
			>
				{children}
			</form>
		</Modal>
	);
}
