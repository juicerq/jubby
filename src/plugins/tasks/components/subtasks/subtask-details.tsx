import { GitCommitHorizontal, StickyNote } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Subtask, SubtaskCategory } from "../../types";
import { NotesModal } from "../modals/notes-modal";

const categories: {
	value: SubtaskCategory;
	label: string;
	activeClass: string;
}[] = [
	{
		value: "types",
		label: "Types",
		activeClass: "bg-cyan-500/20 text-cyan-400",
	},
	{
		value: "functional",
		label: "Functional",
		activeClass: "bg-sky-500/20 text-sky-400",
	},
	{ value: "fix", label: "Fix", activeClass: "bg-rose-500/20 text-rose-400" },
	{
		value: "test",
		label: "Test",
		activeClass: "bg-violet-500/20 text-violet-400",
	},
	{
		value: "refactor",
		label: "Refactor",
		activeClass: "bg-emerald-500/20 text-emerald-400",
	},
	{
		value: "cleanup",
		label: "Cleanup",
		activeClass: "bg-slate-500/20 text-slate-400",
	},
	{
		value: "docs",
		label: "Docs",
		activeClass: "bg-indigo-500/20 text-indigo-400",
	},
];

/**
 * Returns the errorMessage from the most recent execution log with outcome 'failed'.
 * Returns null if there are no failed execution logs or if the most recent failed log has no error message.
 */
export function getLatestErrorMessage(subtask: Subtask): string | null {
	const failedLogs = subtask.executionLogs.filter(
		(log) => log.outcome === "failed",
	);

	if (failedLogs.length === 0) {
		return null;
	}

	// Sort by startedAt descending to get the most recent first
	const sortedFailedLogs = [...failedLogs].sort(
		(a, b) => b.startedAt - a.startedAt,
	);

	return sortedFailedLogs[0].errorMessage;
}

interface SubtaskDetailsProps {
	category: SubtaskCategory;
	shouldCommit: boolean;
	notes: string;
	subtask: Subtask;
	onUpdateCategory: (category: SubtaskCategory) => void;
	onUpdateShouldCommit: (shouldCommit: boolean) => void;
}

function SubtaskDetails({
	category,
	shouldCommit,
	notes,
	subtask,
	onUpdateCategory,
	onUpdateShouldCommit,
}: SubtaskDetailsProps) {
	const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
	const hasNotes = notes.trim().length > 0;
	const errorMessage =
		subtask.status === "failed" ? getLatestErrorMessage(subtask) : null;

	return (
		<div className="flex flex-col gap-3">
			<span className="text-[10px] font-medium tracking-wider text-white/35">
				Details
			</span>
			<div className="flex flex-col gap-2.5">
				<div className="flex flex-wrap items-center gap-4">
					<div className="flex items-center gap-2">
						<span className="text-[11px] text-white/45">Category</span>
						<div className="flex flex-wrap gap-1">
							{categories.map((cat) => (
								<button
									key={cat.value}
									type="button"
									onClick={() => onUpdateCategory(cat.value)}
									className={cn(
										"flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all duration-150 ease-out active:scale-[0.97]",
										category === cat.value
											? cat.activeClass
											: "bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/55",
									)}
								>
									{cat.label}
								</button>
							))}
						</div>
					</div>

					<div className="flex items-center gap-2">
						<span className="text-[11px] text-white/45">Commit</span>
						<button
							type="button"
							onClick={() => onUpdateShouldCommit(!shouldCommit)}
							className={cn(
								"flex h-5 w-9 cursor-pointer items-center rounded-full p-0.5 transition-all duration-200 ease-out",
								shouldCommit ? "bg-emerald-500/30" : "bg-white/10",
							)}
							aria-label={
								shouldCommit ? "Disable auto-commit" : "Enable auto-commit"
							}
						>
							<motion.div
								layout
								transition={{ type: "spring", stiffness: 500, damping: 30 }}
								className={cn(
									"flex h-4 w-4 items-center justify-center rounded-full shadow-sm",
									shouldCommit ? "bg-emerald-400" : "bg-white/50",
								)}
							>
								<GitCommitHorizontal
									className={cn(
										"h-2.5 w-2.5",
										shouldCommit ? "text-emerald-950" : "text-white/50",
									)}
								/>
							</motion.div>
						</button>
					</div>

					<button
						type="button"
						onClick={() => setIsNotesModalOpen(true)}
						className={cn(
							"flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all duration-150 ease-out active:scale-[0.97]",
							hasNotes
								? "bg-amber-500/15 text-amber-400"
								: "bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/55",
						)}
					>
						<StickyNote className="h-2.5 w-2.5" />
						View notes
					</button>
				</div>
			</div>

			{errorMessage && (
				<div className="flex flex-col gap-1">
					<span className="text-[9px] font-medium uppercase tracking-wider text-red-400/50">
						Error
					</span>
					<p className="rounded bg-red-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-red-400/70">
						{errorMessage}
					</p>
				</div>
			)}

			{isNotesModalOpen && (
				<NotesModal notes={notes} onClose={() => setIsNotesModalOpen(false)} />
			)}
		</div>
	);
}

export { SubtaskDetails };
export type { SubtaskDetailsProps };
