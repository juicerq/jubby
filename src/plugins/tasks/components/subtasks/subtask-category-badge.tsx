import { Code2, TestTube2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubtaskCategory } from "../../types";

interface SubtaskCategoryBadgeProps {
	category: SubtaskCategory;
}

function SubtaskCategoryBadge({ category }: SubtaskCategoryBadgeProps) {
	return (
		<span
			className={cn(
				"flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
				category === "functional" && "bg-sky-500/15 text-sky-400",
				category === "test" && "bg-violet-500/15 text-violet-400",
			)}
		>
			{category === "functional" ? (
				<Code2 className="h-2.5 w-2.5" />
			) : (
				<TestTube2 className="h-2.5 w-2.5" />
			)}
			{category}
		</span>
	);
}

export { SubtaskCategoryBadge };
export type { SubtaskCategoryBadgeProps };
