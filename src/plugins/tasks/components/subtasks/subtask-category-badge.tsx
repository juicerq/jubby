import { cn } from "@/lib/utils";
import { CATEGORY_ICONS } from "../../constants";
import type { SubtaskCategory } from "../../types";

interface SubtaskCategoryBadgeProps {
	category: SubtaskCategory;
}

const categoryStyles: Record<SubtaskCategory, string> = {
	functional: "bg-sky-500/15 text-sky-400",
	test: "bg-violet-500/15 text-violet-400",
	types: "bg-cyan-500/15 text-cyan-400",
	fix: "bg-rose-500/15 text-rose-400",
	refactor: "bg-emerald-500/15 text-emerald-400",
	cleanup: "bg-slate-500/15 text-slate-400",
	docs: "bg-indigo-500/15 text-indigo-400",
};

function SubtaskCategoryBadge({ category }: SubtaskCategoryBadgeProps) {
	const Icon = CATEGORY_ICONS[category];
	return (
		<span
			className={cn(
				"flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
				categoryStyles[category],
			)}
		>
			<Icon className="h-2.5 w-2.5" />
			{category}
		</span>
	);
}

export { SubtaskCategoryBadge };
export type { SubtaskCategoryBadgeProps };
