import { ChevronRight, History, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ExecutionLog } from "../../types";

interface AggregatedLog {
	log: ExecutionLog;
	subtaskId: string;
	subtaskText: string;
}

interface HistoryModalProps {
	logs: AggregatedLog[];
	subtaskName?: string;
	onClose: () => void;
}

function HistoryModal({ logs, subtaskName, onClose }: HistoryModalProps) {
	const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

	const toggleLogExpansion = (logId: string) => {
		setExpandedLogId((prev) => (prev === logId ? null : logId));
	};

	const formatTime = (timestamp: number) => {
		return new Date(timestamp).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const title = subtaskName ? `History: ${subtaskName}` : "Execution History";

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.15 }}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<motion.div
				initial={{ opacity: 0, scale: 0.95, y: 10 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				exit={{ opacity: 0, scale: 0.95, y: 10 }}
				transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
				className="mx-4 flex min-h-[80vh] max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0c] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
							<History className="h-4 w-4 text-white/70" />
						</div>
						<div>
							<h2 className="text-[14px] font-semibold tracking-tight text-white/90">
								{title}
							</h2>
							<p className="text-[11px] text-white/40">
								{logs.length} execution{logs.length !== 1 ? "s" : ""}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-white/40 transition-all duration-150 hover:bg-white/8 hover:text-white/70 active:scale-95"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto p-4">
					{logs.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12">
							<History className="mb-3 h-8 w-8 text-white/20" />
							<span className="text-[13px] text-white/40">
								No execution history yet
							</span>
						</div>
					) : (
						<div className="flex flex-col gap-2">
							{logs.map((item) => (
								<HistoryModalItem
									key={`${item.log.id}-${item.subtaskId}`}
									item={item}
									isExpanded={expandedLogId === item.log.id}
									onToggle={() => toggleLogExpansion(item.log.id)}
									formatTime={formatTime}
									showSubtaskName={!subtaskName}
								/>
							))}
						</div>
					)}
				</div>
			</motion.div>
		</motion.div>
	);
}

interface HistoryModalItemProps {
	item: AggregatedLog;
	isExpanded: boolean;
	onToggle: () => void;
	formatTime: (timestamp: number) => string;
	showSubtaskName: boolean;
}

function HistoryModalItem({
	item,
	isExpanded,
	onToggle,
	formatTime,
	showSubtaskName,
}: HistoryModalItemProps) {
	const { log, subtaskText } = item;

	const hasDetails =
		log.filesChanged.length > 0 ||
		log.learnings.patterns.length > 0 ||
		log.learnings.gotchas.length > 0 ||
		log.learnings.context.length > 0 ||
		log.committed ||
		log.errorMessage;

	return (
		<div
			className={cn(
				"flex flex-col rounded-lg bg-white/[0.03] transition-all duration-150",
				hasDetails && "cursor-pointer hover:bg-white/[0.05]",
			)}
			onClick={hasDetails ? onToggle : undefined}
		>
			<div className="flex items-center gap-2.5 px-3 py-2.5">
				<span className="shrink-0 text-[10px] tabular-nums text-white/35">
					{formatTime(log.startedAt)}
				</span>
				<OutcomeBadge outcome={log.outcome} />
				{showSubtaskName && (
					<span className="min-w-0 flex-1 truncate text-[11px] text-white/50">
						{subtaskText}
					</span>
				)}
				{log.duration && (
					<span className="shrink-0 text-[10px] tabular-nums text-white/25">
						{Math.round(log.duration / 1000)}s
					</span>
				)}
				{hasDetails && (
					<motion.div
						animate={{ rotate: isExpanded ? 90 : 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="flex h-4 w-4 shrink-0 items-center justify-center"
					>
						<ChevronRight className="h-3 w-3 text-white/20" />
					</motion.div>
				)}
			</div>

			{log.summary && (
				<div className="px-3 pb-2.5">
					<p
						className={cn(
							"text-[11px] leading-relaxed text-white/40",
							!isExpanded && "line-clamp-2",
						)}
					>
						{log.summary}
					</p>
				</div>
			)}

			<AnimatePresence>
				{isExpanded && hasDetails && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-3 border-t border-white/6 px-3 py-3">
							{log.filesChanged.length > 0 && (
								<div className="flex flex-col gap-1">
									<span className="text-[9px] font-medium uppercase tracking-wider text-white/30">
										Files Changed
									</span>
									<div className="flex flex-wrap gap-1">
										{log.filesChanged.map((file) => (
											<span
												key={file}
												className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-white/50"
											>
												{file.split("/").pop()}
											</span>
										))}
									</div>
								</div>
							)}

							{log.learnings.patterns.length > 0 && (
								<LearningsSection
									title="Patterns Discovered"
									items={log.learnings.patterns}
									colorClass="text-sky-400/70"
									bgClass="bg-sky-500/10"
								/>
							)}

							{log.learnings.gotchas.length > 0 && (
								<LearningsSection
									title="Gotchas Encountered"
									items={log.learnings.gotchas}
									colorClass="text-amber-400/70"
									bgClass="bg-amber-500/10"
								/>
							)}

							{log.learnings.context.length > 0 && (
								<LearningsSection
									title="Useful Context"
									items={log.learnings.context}
									colorClass="text-violet-400/70"
									bgClass="bg-violet-500/10"
								/>
							)}

							{log.committed && log.commitHash && (
								<div className="flex flex-col gap-1">
									<span className="text-[9px] font-medium uppercase tracking-wider text-white/30">
										Commit
									</span>
									<div className="flex items-center gap-2">
										<span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400/70">
											{log.commitHash.slice(0, 7)}
										</span>
										{log.commitMessage && (
											<span className="truncate text-[10px] text-white/40">
												{log.commitMessage}
											</span>
										)}
									</div>
								</div>
							)}

							{log.errorMessage && (
								<div className="flex flex-col gap-1">
									<span className="text-[9px] font-medium uppercase tracking-wider text-red-400/50">
										Error
									</span>
									<p className="rounded bg-red-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-red-400/70">
										{log.errorMessage}
									</p>
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface OutcomeBadgeProps {
	outcome: ExecutionLog["outcome"];
}

function OutcomeBadge({ outcome }: OutcomeBadgeProps) {
	return (
		<span
			className={cn(
				"rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
				outcome === "success" && "bg-emerald-500/15 text-emerald-400",
				outcome === "partial" && "bg-amber-500/15 text-amber-400",
				outcome === "failed" && "bg-red-500/15 text-red-400",
				outcome === "aborted" && "bg-white/10 text-white/40",
			)}
		>
			{outcome}
		</span>
	);
}

interface LearningsSectionProps {
	title: string;
	items: string[];
	colorClass: string;
	bgClass: string;
}

function LearningsSection({
	title,
	items,
	colorClass,
	bgClass,
}: LearningsSectionProps) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-[9px] font-medium uppercase tracking-wider text-white/30">
				{title}
			</span>
			<ul className={cn("flex flex-col gap-0.5 rounded px-2 py-1.5", bgClass)}>
				{items.map((item) => (
					<li
						key={item}
						className={cn(
							"text-[10px] leading-relaxed before:mr-1.5 before:content-['•']",
							colorClass,
						)}
					>
						{item}
					</li>
				))}
			</ul>
		</div>
	);
}

export { HistoryModal };
export type { AggregatedLog, HistoryModalProps };
