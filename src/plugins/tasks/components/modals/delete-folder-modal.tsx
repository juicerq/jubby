import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface DeleteFolderModalProps {
	folderName: string;
	taskCount: number;
	tagCount: number;
	onConfirm: () => void;
	onClose: () => void;
}

function DeleteFolderModal({
	folderName,
	taskCount,
	tagCount,
	onConfirm,
	onClose,
}: DeleteFolderModalProps) {
	const [countdown, setCountdown] = useState(3);

	useEffect(() => {
		if (countdown <= 0) return;

		const interval = setInterval(() => {
			setCountdown((prev) => prev - 1);
		}, 1000);

		return () => clearInterval(interval);
	}, [countdown]);

	const isDeleteEnabled = countdown <= 0;

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
				aria-labelledby="delete-folder-title"
			>
				<div className="mb-3 flex items-center justify-between">
					<h2
						id="delete-folder-title"
						className="text-[14px] font-medium text-white/90"
					>
						Delete Folder
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

				<p className="text-[13px] text-white/70 leading-relaxed">
					Delete <span className="font-medium text-white/90">{folderName}</span>
					? This will remove {taskCount} task
					{taskCount !== 1 ? "s" : ""} and {tagCount} tag
					{tagCount !== 1 ? "s" : ""}.
				</p>

				<div className="mt-4 flex gap-2">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 cursor-pointer rounded-lg bg-white/6 px-4 py-2 text-[13px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/10 active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={!isDeleteEnabled}
						className={cn(
							"flex-1 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-150 ease-out active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
							isDeleteEnabled
								? "cursor-pointer bg-red-500 text-white hover:bg-red-600"
								: "bg-red-500/40 text-white/50 cursor-not-allowed",
						)}
					>
						{isDeleteEnabled ? "Delete" : `Delete (${countdown}s)`}
					</button>
				</div>
			</div>
		</div>
	);
}

export { DeleteFolderModal };
export type { DeleteFolderModalProps };
