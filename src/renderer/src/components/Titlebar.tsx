import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@renderer/lib/cn";
import { orpc } from "@renderer/lib/api";

export function Titlebar() {
	const queryClient = useQueryClient();
	const state = useQuery(orpc.window.state.queryOptions());
	const maximized = state.data?.maximized ?? false;

	const minimize = useMutation(orpc.window.minimize.mutationOptions());

	const toggleMaximize = useMutation(
		orpc.window.toggleMaximize.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.window.state.key(),
				});
			},
		}),
	);

	const close = useMutation(orpc.window.close.mutationOptions());

	return (
		<header className="titlebar flex h-8 items-center justify-between border-b border-border bg-bg">
			<span className="type-ui-label flex items-center gap-1.5 px-3 text-fg-dim"><span className="text-base leading-none">▣</span> JUBBY_OS</span>

			<div className="no-drag flex h-full items-center">
				<ControlButton
					aria-label="Minimize"
					onClick={() => minimize.mutate()}
				>
					—
				</ControlButton>

				<ControlButton
					aria-label={maximized ? "Restore" : "Maximize"}
					onClick={() => toggleMaximize.mutate()}
				>
					{maximized && "+"}
					{!maximized && "□"}
				</ControlButton>

				<ControlButton
					aria-label="Close"
					onClick={() => close.mutate()}
					danger
				>
					×
				</ControlButton>
			</div>
		</header>
	);
}

interface ControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	"aria-label": string;
	children: ReactNode;
	danger?: boolean;
}

function ControlButton({
	children,
	danger,
	className,
	...rest
}: ControlButtonProps) {
	return (
		<button
			type="button"
			className={cn(
				"type-mono-data inline-flex h-full w-11 items-center justify-center text-fg-muted transition-colors cursor-pointer",
				danger
					? "hover:bg-error-bg hover:text-error"
					: "hover:bg-surface-2 hover:text-fg",
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
