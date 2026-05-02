import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@renderer/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	"aria-label": string;
	children: ReactNode;
}

export function IconButton({
	className,
	children,
	type = "button",
	...rest
}: IconButtonProps) {
	return (
		<button
			// eslint-disable-next-line react/button-has-type
			type={type}
			className={cn(
				"inline-flex size-[25px] items-center justify-center text-fg-muted hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-40",
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
