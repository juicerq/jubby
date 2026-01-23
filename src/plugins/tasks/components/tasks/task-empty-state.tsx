interface TaskEmptyStateProps {
	hasFilter?: boolean;
}

function TaskEmptyState({ hasFilter = false }: TaskEmptyStateProps) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
			<div className="text-[28px] leading-none opacity-60">○</div>
			<p className="text-[13px] font-normal tracking-[-0.01em]">
				{hasFilter ? "No tasks match the filter" : "No tasks yet"}
			</p>
		</div>
	);
}

export { TaskEmptyState };
export type { TaskEmptyStateProps };
