import { X } from "lucide-react";

interface NotesModalProps {
	notes: string;
	onClose: () => void;
}

function NotesModal({ notes, onClose }: NotesModalProps) {
	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[300px] rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="notes-modal-title"
			>
				<div className="mb-3 flex items-center justify-between">
					<h2
						id="notes-modal-title"
						className="text-[14px] font-medium text-white/90"
					>
						Notes
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="max-h-[200px] overflow-y-auto rounded-lg bg-white/5 p-3">
					{notes ? (
						<p className="whitespace-pre-wrap text-[12px] leading-relaxed text-white/70">
							{notes}
						</p>
					) : (
						<p className="text-[12px] italic text-white/30">No notes yet</p>
					)}
				</div>
			</div>
		</div>
	);
}

export { NotesModal };
export type { NotesModalProps };
