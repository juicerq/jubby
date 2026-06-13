import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn } from "@renderer/lib/cn";

const components: Components = {
	h1: ({ children }) => (
		<h1 className="type-h1 mt-6 mb-4 text-accent first:mt-0">
			<span className="text-fg-dim">{"# "}</span>
			{children}
		</h1>
	),
	h2: ({ children }) => (
		<h2 className="type-h2 mt-6 mb-3 text-accent first:mt-0">
			<span className="text-fg-dim">{"## "}</span>
			{children}
		</h2>
	),
	h3: ({ children }) => (
		<h3 className="type-task-title mt-5 mb-2 text-fg first:mt-0">
			<span className="text-fg-dim">{"### "}</span>
			{children}
		</h3>
	),
	h4: ({ children }) => (
		<h4 className="type-ui-label mt-4 mb-2 text-fg-muted first:mt-0">
			{children}
		</h4>
	),
	p: ({ children }) => (
		<p className="type-body-md my-3 text-fg leading-relaxed">{children}</p>
	),
	a: ({ children, href }) => (
		<a
			href={href}
			className="text-accent underline decoration-fg-dim underline-offset-2 hover:decoration-accent"
		>
			{children}
		</a>
	),
	strong: ({ children }) => (
		<strong className="font-bold text-fg">{children}</strong>
	),
	em: ({ children }) => <em className="italic text-fg-muted">{children}</em>,
	ul: ({ children }) => (
		<ul className="my-3 ml-4 flex flex-col gap-1.5 [&_ul]:mt-1.5 [&_ul]:mb-0 [&_ol]:mt-1.5 [&_ol]:mb-0">
			{children}
		</ul>
	),
	ol: ({ children }) => (
		<ol className="my-3 ml-4 flex list-decimal flex-col gap-1.5 marker:text-fg-dim [&_ul]:mt-1.5 [&_ul]:mb-0 [&_ol]:mt-1.5 [&_ol]:mb-0">
			{children}
		</ol>
	),
	li: ({ children, className }) => {
		if (className?.includes("task-list-item")) {
			return (
				<li className="type-body-md flex list-none items-start gap-2 text-fg">
					{children}
				</li>
			);
		}

		return (
			<li className="type-body-md text-fg marker:text-fg-dim [li:not([class])>&]:before:mr-2 [li:not([class])>&]:before:text-fg-dim before:content-['>']">
				{children}
			</li>
		);
	},
	input: ({ checked }) => (
		<span
			aria-hidden
			className={cn(
				"mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border text-[10px] leading-none",
				checked ? "border-accent text-accent" : "border-fg-dim",
			)}
		>
			{!!checked && "x"}
		</span>
	),
	blockquote: ({ children }) => (
		<blockquote className="my-3 border-l-2 border-accent-dim pl-4 text-fg-muted italic">
			{children}
		</blockquote>
	),
	hr: () => <hr className="my-6 border-t border-border" />,
	code: ({ children, className }) => {
		if (className?.includes("language-") || className?.includes("hljs")) {
			return <code className={className}>{children}</code>;
		}

		return (
			<code className="type-mono-data border border-border bg-surface-1 px-1 py-0.5 text-accent">
				{children}
			</code>
		);
	},
	pre: ({ children }) => (
		<pre className="type-mono-data my-4 overflow-x-auto border border-border bg-surface-1 p-3 text-fg">
			{children}
		</pre>
	),
	table: ({ children }) => (
		<div className="my-4 overflow-x-auto">
			<table className="w-full border-collapse border border-border text-left">
				{children}
			</table>
		</div>
	),
	thead: ({ children }) => <thead className="bg-surface-1">{children}</thead>,
	th: ({ children }) => (
		<th className="type-ui-label border border-border px-3 py-2 text-accent">
			{children}
		</th>
	),
	td: ({ children }) => (
		<td className="type-body-md border border-border px-3 py-2 text-fg">
			{children}
		</td>
	),
};

export function GrillMarkdown({ source }: { source: string }) {
	return (
		<div className="grill-markdown">
			<Markdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
				components={components}
			>
				{source}
			</Markdown>
		</div>
	);
}
