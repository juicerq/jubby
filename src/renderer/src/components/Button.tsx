import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@renderer/lib/cn";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
	loading?: boolean;
	children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
	primary:
		"bg-accent text-accent-fg border border-accent hover:brightness-110 disabled:opacity-40",
	ghost:
		"bg-transparent text-fg border border-border hover:border-accent hover:text-accent disabled:opacity-40",
	danger:
		"bg-transparent text-error border border-error hover:bg-error/10 disabled:opacity-40",
};

const sizeClasses: Record<Size, string> = {
	md: "px-4 py-2",
	sm: "px-3 py-1",
};

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function useSpinner(active: boolean): string {
	const [frame, setFrame] = useState(0);

	// Drive spinner via setInterval (external timer).
	useEffect(() => {
		if (!active) {
			return;
		}

		const id = setInterval(() => {
			setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
		}, 100);

		return () => clearInterval(id);
	}, [active]);

	return SPINNER_FRAMES[frame];
}

export function Button({
	variant = "primary",
	size = "md",
	className,
	children,
	loading,
	disabled,
	type = "button",
	...rest
}: ButtonProps) {
	const spinner = useSpinner(!!loading);

	return (
		<button
			// eslint-disable-next-line react/button-has-type
			type={type}
			disabled={loading || disabled}
			className={cn(
				"type-ui-label inline-flex items-center justify-center gap-2 transition-[filter,background,border] cursor-pointer",
				variantClasses[variant],
				sizeClasses[size],
				className,
			)}
			{...rest}
		>
			{children}
			{loading && (
				<span aria-hidden className="inline-block w-3 text-center">
					{spinner}
				</span>
			)}
		</button>
	);
}
