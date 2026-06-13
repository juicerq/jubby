import { cn } from "@renderer/lib/cn";

export function TabButton({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"type-ui-label px-6 py-2 transition-colors cursor-pointer",
				active
					? "text-accent border-b border-accent"
					: "text-fg-muted hover:text-fg",
			)}
		>
			{label}
		</button>
	);
}
