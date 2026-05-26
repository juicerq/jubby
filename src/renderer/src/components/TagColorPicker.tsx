import { tagColorHex, type TagColor } from "@renderer/constants/tag-colors";
import { cn } from "@renderer/lib/cn";

const COLORS: TagColor[] = ["green", "amber", "red", "cyan", "magenta"];

type TagColorPickerProps = {
	value: TagColor;
	onChange: (color: TagColor) => void;
	size?: "sm" | "md";
};

export function TagColorPicker({
	value,
	onChange,
	size = "sm",
}: TagColorPickerProps) {
	const dim = size === "md" ? "size-5" : "size-4";

	return (
		<div className="inline-flex items-center gap-1">
			{COLORS.map((c) => {
				const selected = c === value;
				return (
					<button
						key={c}
						type="button"
						aria-label={c}
						aria-pressed={selected}
						onMouseDown={(e) => {
							e.preventDefault();
							onChange(c);
						}}
						className={cn(
							"border transition-transform cursor-pointer",
							dim,
							selected
								? "border-fg scale-110"
								: "border-border hover:border-fg-muted",
						)}
						style={{ backgroundColor: tagColorHex[c] }}
					/>
				);
			})}
		</div>
	);
}
