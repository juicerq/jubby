import { useEffect, useState } from "react";

export function useNow(intervalMs: number = 1000): Date {
	const [now, setNow] = useState(() => new Date());

	// Subscribe to wall-clock ticks via setInterval (external timer).
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);

	return now;
}

export function formatSysDate(d: Date): string {
	const months = [
		"JAN",
		"FEB",
		"MAR",
		"APR",
		"MAY",
		"JUN",
		"JUL",
		"AUG",
		"SEP",
		"OCT",
		"NOV",
		"DEC",
	];
	const day = String(d.getDate()).padStart(2, "0");
	const month = months[d.getMonth()];
	const year = d.getFullYear();
	return `${day} ${month} ${year}`;
}

export function formatSysTime(d: Date): string {
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

export function formatBytes(n: number): string {
	if (n < 1024) {
		return `${n}B`;
	}

	if (n < 1024 * 1024) {
		return `${(n / 1024).toFixed(1)}KB`;
	}

	return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

export function shortHash(id: string, len: number = 4): string {
	return id.replaceAll("-", "").slice(0, len);
}

export function formatAge(createdAt: number, now: number = Date.now()): string {
	const seconds = Math.max(0, Math.floor(now / 1000) - createdAt);
	const days = Math.floor(seconds / 86400);

	if (days < 1) {
		const hours = Math.floor(seconds / 3600);
		return hours === 0 ? "<1h" : `${hours}h`;
	}

	if (days < 14) {
		return `${days}d`;
	}

	if (days < 30) {
		return `${Math.floor(days / 7)}w`;
	}

	return `30d+`;
}
