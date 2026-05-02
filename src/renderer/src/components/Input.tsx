import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@renderer/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
}

export function Input({ label, className, id, ...rest }: InputProps) {
	const inputId = id ?? rest.name;

	return (
		<div className="flex flex-col gap-1">
			{!!label && (
				<label htmlFor={inputId} className="type-ui-label text-fg-muted">
					{label}
				</label>
			)}
			<input
				id={inputId}
				className={cn(
					"type-body-md bg-surface-3 border border-border px-3 py-2 text-fg outline-none focus:border-accent transition-colors placeholder:text-fg-dim",
					className,
				)}
				{...rest}
			/>
		</div>
	);
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	label?: string;
}

export function TextArea({ label, className, id, ...rest }: TextAreaProps) {
	const textAreaId = id ?? rest.name;

	return (
		<div className="flex flex-col gap-1">
			{!!label && (
				<label htmlFor={textAreaId} className="type-ui-label text-fg-muted">
					{label}
				</label>
			)}
			<textarea
				id={textAreaId}
				className={cn(
					"type-body-md bg-surface-3 border border-border px-3 py-2 text-fg outline-none focus:border-accent transition-colors placeholder:text-fg-dim resize-none",
					className,
				)}
				{...rest}
			/>
		</div>
	);
}
