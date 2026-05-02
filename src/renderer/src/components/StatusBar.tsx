import { useQuery } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";
import {
	formatBytes,
	formatSysDate,
	formatSysTime,
	useNow,
} from "@renderer/lib/now";

export function StatusBar() {
	const now = useNow(1000);
	const stats = useQuery(orpc.system.stats.queryOptions());

	const sizeLabel = stats.data ? formatBytes(stats.data.sizeBytes) : "-";
	const flushLabel =
		stats.data?.lastFlushAt !== null && stats.data?.lastFlushAt !== undefined
			? formatSysTime(new Date(stats.data.lastFlushAt))
			: "-";

	return (
		<footer className="type-mono-data flex h-6 items-center justify-between border-t border-border bg-surface-1 px-3 text-fg-muted">
			<span>
				STORE: data.json ({sizeLabel}) // LAST_FLUSH: {flushLabel}
			</span>
			<span>
				{formatSysDate(now)} // SYS.TIME: {formatSysTime(now)}
			</span>
		</footer>
	);
}
