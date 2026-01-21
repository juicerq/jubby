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
