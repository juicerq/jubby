import { useEffect, useRef, useState } from "react";
import { Button } from "@renderer/components/Button";
import { cn } from "@renderer/lib/cn";

type TwoStepProps = {
	mode: "two-step";
	checked: boolean;
	onConfirm: () => void;
	durationMs?: number;
	"aria-label"?: string;
};

type TimedProps = {
	mode: "timed";
	label: string;
	onConfirm: () => void;
	durationMs?: number;
	variant?: "primary" | "danger";
};

type ConfirmActionProps = TwoStepProps | TimedProps;

export function ConfirmAction(props: ConfirmActionProps) {
	if (props.mode === "two-step") {
		return <TwoStepCheckbox {...props} />;
	}

	return <TimedButton {...props} />;
}

function checkboxGlyph(checked: boolean, armed: boolean): string {
	if (armed) {
		return "[~]";
	}

	return checked ? "[x]" : "[ ]";
}

function checkboxColor(checked: boolean, armed: boolean): string {
	if (armed) {
		return "text-accent";
	}

	if (checked) {
		return "text-fg-muted";
	}

	return "text-fg-muted hover:text-accent";
}

function TwoStepCheckbox({
	checked,
	onConfirm,
	durationMs = 1000,
	"aria-label": ariaLabel,
}: TwoStepProps) {
	const [armed, setArmed] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear pending setTimeout on unmount; the timer is an external resource.
	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	const handleClick = () => {
		if (armed) {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setArmed(false);
			onConfirm();
			return;
		}

		setArmed(true);
		timerRef.current = setTimeout(() => {
			setArmed(false);
			timerRef.current = null;
		}, durationMs);
	};

	const labelFallback = checked ? "Mark not done" : "Mark done";

	return (
		<button
			type="button"
			aria-label={ariaLabel ?? labelFallback}
			aria-pressed={checked}
			onClick={handleClick}
			className={cn(
				"type-mono-data inline-flex h-5 min-w-[28px] items-center justify-center transition-colors cursor-pointer",
				checkboxColor(checked, armed),
			)}
		>
			{checkboxGlyph(checked, armed)}
		</button>
	);
}

function TimedButton({
	label,
	onConfirm,
	durationMs = 3000,
	variant = "danger",
}: TimedProps) {
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
