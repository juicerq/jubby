export type TraceContext = Record<string, string | number | boolean>;

export interface TraceError {
	message: string;
	code: string;
}

export type ContextCleanup = () => void;

export interface Trace {
	readonly id: string;
	push(ctx: TraceContext): ContextCleanup;
	debug(msg: string): void;
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string, err: TraceError): void;
	end(): void;
	[Symbol.dispose]: () => void;
}

function generateTraceId(): string {
	return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}

type LogLevel = "debug" | "info" | "warn" | "error" | "trace_end";

interface LogEntry {
	ts: string;
	trace: string;
	level: LogLevel;
	msg: string;
	ctx?: TraceContext;
	err?: TraceError;
	duration_ms?: number;
	status?: "ok" | "error";
}

class TraceImpl implements Trace {
	readonly id: string;
	private contextStack: TraceContext[] = [];
	private startedAt: number;
	private hasError = false;
	private ended = false;

	constructor(initialContext?: TraceContext) {
		this.id = generateTraceId();
		this.startedAt = performance.now();
		if (initialContext) {
			this.contextStack.push(initialContext);
		}
	}

	push(ctx: TraceContext): ContextCleanup {
		this.contextStack.push(ctx);
		return () => {
			const idx = this.contextStack.lastIndexOf(ctx);
			if (idx !== -1) {
				this.contextStack.splice(idx, 1);
			}
		};
	}

	private mergedContext(): TraceContext | undefined {
		if (this.contextStack.length === 0) return undefined;
		return Object.assign({}, ...this.contextStack);
	}

	private emit(
		level: LogLevel,
		msg: string,
		err?: TraceError,
		extra?: Partial<LogEntry>,
	) {
		const entry: LogEntry = {
			ts: new Date().toISOString(),
			trace: this.id,
			level,
			msg,
			...extra,
		};

		const ctx = this.mergedContext();
		if (ctx) entry.ctx = ctx;
		if (err) {
			entry.err = err;
			this.hasError = true;
		}

		const logFn =
			level === "error"
				? console.error
				: level === "warn"
					? console.warn
					: console.log;
		logFn(`[${this.id}] ${level}: ${msg}`, entry.ctx ?? "", err ?? "");
	}

	debug(msg: string): void {
		this.emit("debug", msg);
	}

	info(msg: string): void {
		this.emit("info", msg);
	}

	warn(msg: string): void {
		this.emit("warn", msg);
	}

	error(msg: string, err: TraceError): void {
		this.emit("error", msg, err);
	}

	end(): void {
		if (this.ended) return;
		this.ended = true;

		const duration_ms = Math.round(performance.now() - this.startedAt);
		const status = this.hasError ? "error" : "ok";
		this.emit("trace_end", "", undefined, { duration_ms, status });
	}

	[Symbol.dispose](): void {
		this.end();
	}
}

export function createTrace(initialContext?: TraceContext): Trace {
	return new TraceImpl(initialContext);
}
