import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@renderer/lib/cn";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
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

export function Button({
	variant = "primary",
	size = "md",
	className,
	children,
	type = "button",
	...rest
}: ButtonProps) {
	return (
		<button
			// eslint-disable-next-line react/button-has-type
			type={type}
			className={cn(
				"type-ui-label inline-flex items-center justify-center gap-2 transition-[filter,background,border] cursor-pointer",
				variantClasses[variant],
				sizeClasses[size],
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
