import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@renderer/lib/cn";

type ToastSeverity = "ok" | "err";

type Toast = {
	id: number;
	severity: ToastSeverity;
	message: string;
};

type ToastContextValue = {
	push: (severity: ToastSeverity, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 2500;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const push = useCallback((severity: ToastSeverity, message: string) => {
		const id = nextId++;
		setToasts((prev) => [...prev, { id, severity, message }]);
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, TOAST_DURATION_MS);
	}, []);

	return (
		<ToastContext.Provider value={{ push }}>
			{children}
			<ToastViewport toasts={toasts} />
		</ToastContext.Provider>
	);
}

function ToastViewport({ toasts }: { toasts: Toast[] }) {
	return createPortal(
		<div className="pointer-events-none fixed bottom-10 right-4 z-[60] flex flex-col gap-2">
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className={cn(
						"pointer-events-auto type-mono-data border bg-surface-1 px-3 py-2",
						toast.severity === "ok"
							? "border-accent text-accent"
							: "border-error text-error",
					)}
				>
					[{toast.severity.toUpperCase()}] {toast.message}
				</div>
			))}
		</div>,
		document.body,
	);
}

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);

	if (!ctx) {
		throw new Error("useToast must be used inside <ToastProvider>");
	}

	return ctx;
}
