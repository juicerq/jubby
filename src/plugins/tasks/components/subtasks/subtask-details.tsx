import {
	Code2,
	GitCommitHorizontal,
	StickyNote,
	TestTube2,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SubtaskCategory } from "../../types";
import { NotesModal } from "../modals/notes-modal";

interface SubtaskDetailsProps {
	category: SubtaskCategory;
	shouldCommit: boolean;
	notes: string;
	onUpdateCategory: (category: SubtaskCategory) => void;
	onUpdateShouldCommit: (shouldCommit: boolean) => void;
}

function SubtaskDetails({
	category,
	shouldCommit,
	notes,
	onUpdateCategory,
	onUpdateShouldCommit,
}: SubtaskDetailsProps) {
	const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
	const hasNotes = notes.trim().length > 0;

	return (
		<div className="flex flex-col gap-3">
			<span className="text-[10px] font-medium tracking-wider text-white/35">
				Details
			</span>
			<div className="flex flex-col gap-2.5">
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<span className="text-[11px] text-white/45">Category</span>
						<div className="flex gap-1">
							<button
								type="button"
								onClick={() => onUpdateCategory("functional")}
								className={cn(
									"flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all duration-150 ease-out active:scale-[0.97]",
									category === "functional"
										? "bg-sky-500/20 text-sky-400"
										: "bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/55",
								)}
							>
								<Code2 className="h-2.5 w-2.5" />
								Functional
							</button>
							<button
								type="button"
								onClick={() => onUpdateCategory("test")}
								className={cn(
									"flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all duration-150 ease-out active:scale-[0.97]",
									category === "test"
										? "bg-violet-500/20 text-violet-400"
										: "bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/55",
								)}
							>
								<TestTube2 className="h-2.5 w-2.5" />
								Test
							</button>
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

			{isNotesModalOpen && (
				<NotesModal notes={notes} onClose={() => setIsNotesModalOpen(false)} />
			)}
		</div>
	);
}

export { SubtaskDetails };
export type { SubtaskDetailsProps };
