import { useEffect, useState } from "react";
import { Button } from "@renderer/components/Button";

type ConfirmActionProps = {
	label: string;
	onConfirm: () => void;
	durationMs?: number;
	variant?: "primary" | "danger";
};

export function ConfirmAction({
	label,
	onConfirm,
	durationMs = 3000,
	variant = "danger",
}: ConfirmActionProps) {
	const [remainingMs, setRemainingMs] = useState(durationMs);

	// Drive countdown via setInterval (external timer).
	useEffect(() => {
		const start = Date.now();
		const id = setInterval(() => {
			const elapsed = Date.now() - start;
			const left = Math.max(0, durationMs - elapsed);
			setRemainingMs(left);

			if (left === 0) {
				clearInterval(id);
			}
		}, 100);

		return () => clearInterval(id);
	}, [durationMs]);

	const ready = remainingMs === 0;
	const seconds = Math.ceil(remainingMs / 1000);
	const buttonLabel = ready ? label : `${label} (${seconds}s)`;

	return (
		<Button
			variant={variant}
			disabled={!ready}
			onClick={ready ? onConfirm : undefined}
		>
			{buttonLabel}
		</Button>
	);
}
