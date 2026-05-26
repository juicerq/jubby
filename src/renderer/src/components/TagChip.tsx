import { tagColorHex, type TagColor } from "@renderer/constants/tag-colors";
import { cn } from "@renderer/lib/cn";
import { X } from "lucide-react";

type TagChipProps = {
	name: string;
	color: TagColor;
	onRemove?: () => void;
	onClick?: () => void;
	active?: boolean;
	size?: "sm" | "md";
};

export function TagChip({
	name,
	color,
	onRemove,
	onClick,
	active,
	size = "sm",
}: TagChipProps) {
	const hex = tagColorHex[color];
	const interactive = !!onClick;
	const padding = size === "md" ? "px-2 py-1" : "px-1.5 py-0.5";

	const style = active
		? { backgroundColor: hex, color: "#000", borderColor: hex }
		: { color: hex, borderColor: hex };

	return (
		<span
			role={interactive ? "button" : undefined}
			tabIndex={interactive ? 0 : undefined}
			onClick={onClick}
			onKeyDown={
				interactive
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onClick();
							}
						}
					: undefined
			}
			className={cn(
				"type-ui-label inline-flex items-center gap-1 border bg-transparent",
				padding,
				interactive && "cursor-pointer transition-colors hover:opacity-80",
			)}
			style={style}
		>
			<span className="truncate">{name}</span>
			{!!onRemove && (
				<button
					type="button"
					aria-label={`Remove ${name}`}
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					className="cursor-pointer opacity-70 hover:opacity-100"
				>
					<X size={10} strokeWidth={3} />
				</button>
			)}
		</span>
	);
}
