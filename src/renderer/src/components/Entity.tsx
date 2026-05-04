import {
	type EntityExpression,
	type EntityMood,
	entityMoods,
} from "@shared/entity-constants";
import { Scramble } from "@renderer/components/Scramble";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import type { EntityEvent } from "@renderer/lib/entity-bus";
import { entityBus } from "@renderer/lib/entity-bus";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

function pickMood(): EntityMood {
	return entityMoods[Math.floor(Math.random() * entityMoods.length)];
}

const sprites: Record<EntityExpression, string> = {
	neutral: "(• ᴗ •)",
	happy: "(^ ᴗ ^)",
	excited: "(✧ ᴗ ✧)",
	sleepy: "(- ᴗ -)",
	grumpy: "(• ︿ •)",
	curious: "(◉ ᴗ ◉)",
	shocked: "(⊙ ᴗ ⊙)",
	glitched: "(╳ _ ╳)",
};

const BUFFER_MS = 10_000;
const REACTION_TTL_MS = 10_000;
const IDLE_MS = 3 * 60 * 1000;
const IDLE_THROTTLE_MS = 1_000;
const MIN_AWAY_MS = 60_000;

const sessionMood = pickMood();

type Reaction = {
	expression: EntityExpression;
	message: string;
};

export function Entity() {
	const hasKey = useQuery({
		...orpc.entity.hasApiKey.queryOptions(),
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (hasKey.isLoading) {
		return <EntityShell sprite={sprites.neutral} />;
	}

	if (!hasKey.data) {
		return <EntityDead />;
	}

	return <EntityAlive />;
}

function EntityAlive() {
	const [reaction, setReaction] = useState<Reaction | null>(null);

	const reactMutation = useMutation(
		orpc.entity.react.mutationOptions({
			onSuccess: (data) => {
				if (data.react) {
					setReaction({ expression: data.expression, message: data.message });
				}
			},
		}),
	);

	// setTimeout é API imperativa: derruba a reação atual em sleep depois de REACTION_TTL_MS.
	useEffect(() => {
		if (!reaction) return;
		const t = setTimeout(() => setReaction(null), REACTION_TTL_MS);
		return () => clearTimeout(t);
	}, [reaction]);

	// Imperative integrations: external event bus + DOM focus/idle listeners.
	useEffect(() => {
		const buffer: EntityEvent[] = [];
		let timer: ReturnType<typeof setTimeout> | null = null;
		let away: number | undefined;

		const flush = () => {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			if (buffer.length === 0) return;

			const events = buffer.splice(0);
			reactMutation.mutate({
				events,
				session: {
					mood: sessionMood,
					...(away ? { awayDuration: away } : {}),
				},
			});
			away = undefined;
		};

		const unsub = entityBus.on((event) => {
			buffer.push(event);
			if (!timer) {
				timer = setTimeout(flush, BUFFER_MS);
			}
		});

		let focused = document.hasFocus();
		let blurTime: number | null = null;
		let lastReset = 0;
		let idleTimer: ReturnType<typeof setTimeout> | null = null;
		let idleFired = false;

		const resetIdle = () => {
			const now = Date.now();
			if (now - lastReset < IDLE_THROTTLE_MS) return;
			lastReset = now;

			idleFired = false;
			if (idleTimer) clearTimeout(idleTimer);
			if (!focused) return;

			idleTimer = setTimeout(() => {
				if (!idleFired && focused) {
					idleFired = true;
					entityBus.emit("idle");
				}
			}, IDLE_MS);
		};

		const handleBlur = () => {
			focused = false;
			blurTime = Date.now();
			if (idleTimer) clearTimeout(idleTimer);
		};

		const handleFocus = () => {
			focused = true;
			if (blurTime) {
				const elapsed = Date.now() - blurTime;
				if (elapsed > MIN_AWAY_MS) {
					away = elapsed;
					entityBus.emit("window:return");
				}
				blurTime = null;
			}
			resetIdle();
		};

		document.addEventListener("mousemove", resetIdle);
		document.addEventListener("keydown", resetIdle);
		document.addEventListener("click", resetIdle);
		window.addEventListener("blur", handleBlur);
		window.addEventListener("focus", handleFocus);
		resetIdle();

		return () => {
			unsub();
			if (timer) clearTimeout(timer);
			document.removeEventListener("mousemove", resetIdle);
			document.removeEventListener("keydown", resetIdle);
			document.removeEventListener("click", resetIdle);
			window.removeEventListener("blur", handleBlur);
			window.removeEventListener("focus", handleFocus);
			if (idleTimer) clearTimeout(idleTimer);
		};
	}, [reactMutation.mutate]);

	if (reactMutation.isPending && !reaction) {
		return <EntityShell sprite={sprites.neutral} message="processando..." />;
	}

	if (!reaction) {
		return <EntityShell sprite="(︶ω︶) zZz" sleeping />;
	}

	return (
		<EntityShell
			sprite={sprites[reaction.expression]}
			message={reaction.message}
			glitched={reaction.expression === "glitched"}
		/>
	);
}

function EntityDead() {
	const [key, setKey] = useState("");
	const queryClient = useQueryClient();
	const toast = useToast();

	const save = useMutation(
		orpc.entity.setApiKey.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.entity.hasApiKey.key(),
				});
			},
			onError: (err) => toast.push("err", String(err)),
		}),
	);

	return (
		<header className="flex flex-col items-center gap-2 border-b border-border px-3 py-3">
			<span className="font-pixel text-fg-dim text-lg">
				{sprites.glitched}
			</span>
			<span className="type-ui-label text-fg-dim">[OFFLINE]</span>
			<form
				className="flex flex-col gap-1.5"
				onSubmit={(e) => {
					e.preventDefault();
					const trimmed = key.trim();
					if (trimmed) {
						save.mutate({ key: trimmed });
					}
				}}
			>
				<input
					type="password"
					placeholder="GROQ API KEY"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					className="type-mono-data bg-surface-3 border border-border px-2 py-1 text-fg text-xs outline-none focus:border-accent transition-colors placeholder:text-fg-dim"
				/>
				<button
					type="submit"
					disabled={!key.trim() || save.isPending}
					className={cn(
						"type-ui-label border border-border px-2 py-1 transition-colors",
						key.trim()
							? "text-accent hover:bg-accent-dim/30 hover:border-accent"
							: "text-fg-dim cursor-not-allowed",
					)}
				>
					{save.isPending && "LINKING..."}
					{!save.isPending && "LINK"}
				</button>
			</form>
		</header>
	);
}

function EntityShell({
	sprite,
	message,
	glitched,
	sleeping,
}: {
	sprite: string;
	message?: string | null;
	glitched?: boolean;
	sleeping?: boolean;
}) {
	return (
		<header className="flex flex-col items-center gap-1 border-b border-border px-3 py-3">
			<span
				className={cn(
					"font-pixel text-lg",
					glitched && "text-error animate-pulse",
					sleeping && "text-fg-dim",
					!glitched && !sleeping && "text-accent",
				)}
			>
				{sprite}
			</span>
			{!!message && (
				<Scramble
					key={message}
					className={cn(
						"type-ui-label text-center",
						glitched ? "text-error" : "text-fg-muted",
					)}
				>
					{message}
				</Scramble>
			)}
		</header>
	);
}
