import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@renderer/components/IconButton";
import { cn } from "@renderer/lib/cn";

type DropdownItem = {
	label: string;
	onSelect: () => void;
	icon?: ReactNode;
	danger?: boolean;
};

type DropdownMenuProps = {
	"aria-label": string;
	items: DropdownItem[];
};

export function DropdownMenu({
	"aria-label": ariaLabel,
	items,
}: DropdownMenuProps) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	// Subscribe to window mousedown/keydown to close on outside click or Escape.
	useEffect(() => {
		if (!open) {
			return;
		}

		const onClickOutside = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) {
				setOpen(false);
			}
		};

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
			}
		};

		window.addEventListener("mousedown", onClickOutside);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", onClickOutside);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="relative" ref={wrapRef}>
			<IconButton
				aria-label={ariaLabel}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<MoreHorizontal size={15} />
			</IconButton>
			{open && (
				<div
					role="menu"
					className="absolute right-0 top-full z-30 mt-1 min-w-[140px] border border-border-strong bg-surface-1 shadow-lg"
				>
					{items.map((item) => (
						<button
							key={item.label}
							type="button"
							role="menuitem"
							onClick={() => {
								setOpen(false);
								item.onSelect();
							}}
							className={cn(
								"type-ui-label flex w-full items-center gap-2 px-3 py-2 text-left transition-colors cursor-pointer",
								item.danger
									? "text-error hover:bg-error/10"
									: "text-fg-muted hover:text-accent hover:bg-surface-2",
							)}
						>
							{!!item.icon && (
								<span className="inline-flex h-4 w-4 items-center justify-center">
									{item.icon}
								</span>
							)}
							<span>{item.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
