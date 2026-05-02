import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "@renderer/components/IconButton";
import { cn } from "@renderer/lib/cn";

type ModalProps = {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
	width?: "sm" | "md" | "lg";
};

const widthClasses: Record<NonNullable<ModalProps["width"]>, string> = {
	sm: "w-[360px]",
	md: "w-[480px]",
	lg: "w-[640px]",
};

export function Modal({
	open,
	onClose,
	title,
	children,
	footer,
	width = "md",
}: ModalProps) {
	// Subscribe to window keydown for Escape; React handlers don't reach here.
	useEffect(() => {
		if (!open) {
			return;
		}

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
			}
		};

		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) {
					onClose();
				}
			}}
		>
			<div
				className={cn(
					"flex flex-col bg-surface-1 border border-border-strong shadow-2xl",
					widthClasses[width],
				)}
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<header className="flex items-center justify-between border-b border-border px-4 py-2">
					<h2 className="type-h2 text-accent">{title}</h2>
					<IconButton aria-label="Close" onClick={onClose}>
						<X size={16} />
					</IconButton>
				</header>
				<div className="flex flex-col gap-3 px-4 py-4">{children}</div>
				{!!footer && (
					<footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
						{footer}
					</footer>
				)}
			</div>
		</div>,
		document.body,
	);
}
