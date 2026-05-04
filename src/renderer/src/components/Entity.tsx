import {
	type EntityExpression,
	type EntityMood,
	entityMoods,
} from "@shared/entity-constants";
import { EntityCanvas } from "@renderer/components/EntityCanvas";
import { Scramble } from "@renderer/components/Scramble";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import type { EntityEvent } from "@renderer/lib/entity-bus";
import { entityBus } from "@renderer/lib/entity-bus";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

function pickMood(): EntityMood {
	return entityMoods[Math.floor(Math.random() * entityMoods.length)];
}

const BUFFER_MS = 10_000;
const REACTION_TTL_MS = 10_000;
const IDLE_MS = 3 * 60 * 1000;
const IDLE_THROTTLE_MS = 1_000;
const MOVE_POLL_MS = 100;
const MOVE_START_MS = 750;
const MOVE_STOP_MS = 200;

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
		return (
			<EntityShell>
				<EntityCanvas mode="idle" />
			</EntityShell>
		);
	}

	if (!hasKey.data) {
		return <EntityDead />;
	}

	return <EntityAlive />;
}

function EntityAlive() {
	const [reaction, setReaction] = useState<Reaction | null>(null);
	const [isMoving, setIsMoving] = useState(false);

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

	// Drag da janela: poll de screenX/Y (frame: false engole pointer events na .titlebar).
	useEffect(() => {
		let lastX = window.screenX;
		let lastY = window.screenY;
		let startTimer: ReturnType<typeof setTimeout> | null = null;
		let stopTimer: ReturnType<typeof setTimeout> | null = null;
		let started = false;

		const stop = () => {
			if (startTimer) {
				clearTimeout(startTimer);
				startTimer = null;
			}
			if (started) {
				started = false;
				setIsMoving(false);
			}
			stopTimer = null;
		};

		const interval = setInterval(() => {
			if (window.screenX === lastX && window.screenY === lastY) return;
			lastX = window.screenX;
			lastY = window.screenY;
			if (!started && !startTimer) {
				startTimer = setTimeout(() => {
					started = true;
					startTimer = null;
					setIsMoving(true);
				}, MOVE_START_MS);
			}
			if (stopTimer) clearTimeout(stopTimer);
			stopTimer = setTimeout(stop, MOVE_STOP_MS);
		}, MOVE_POLL_MS);

		return () => {
			clearInterval(interval);
			if (startTimer) clearTimeout(startTimer);
			if (stopTimer) clearTimeout(stopTimer);
		};
	}, []);

	// Imperative integrations: external event bus + DOM focus/idle listeners.
	useEffect(() => {
		const buffer: EntityEvent[] = [];
		let timer: ReturnType<typeof setTimeout> | null = null;

		const flush = () => {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			if (buffer.length === 0) return;

			const events = buffer.splice(0);
			reactMutation.mutate({
				events,
				session: { mood: sessionMood },
			});
		};

		const unsub = entityBus.on((event) => {
			buffer.push(event);
			if (!timer) {
				timer = setTimeout(flush, BUFFER_MS);
			}
		});

		let focused = document.hasFocus();
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
			if (idleTimer) clearTimeout(idleTimer);
		};

		const handleFocus = () => {
			focused = true;
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

	if (isMoving) {
		return (
			<EntityShell>
				<EntityCanvas mode="moving" />
			</EntityShell>
		);
	}

	if (reactMutation.isPending && !reaction) {
		return (
			<EntityShell message="processando...">
				<EntityCanvas mode="looking_around" />
			</EntityShell>
		);
	}

	if (!reaction) {
		return (
			<EntityShell>
				<EntityCanvas mode="sleeping" />
			</EntityShell>
		);
	}

	return (
		<EntityShell
			message={reaction.message}
			messageError={reaction.expression === "glitched"}
		>
			<EntityCanvas
				mode={reaction.expression}
				className={cn(reaction.expression === "glitched" && "animate-pulse")}
			/>
		</EntityShell>
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
			<EntityCanvas mode="glitched" className="animate-pulse" />
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

type EntityShellProps = {
	children: ReactNode;
	message?: string | null;
	messageError?: boolean;
};

function EntityShell({ children, message, messageError }: EntityShellProps) {
	return (
		<header className="flex flex-col items-center gap-2 border-b border-border px-3 py-3">
			{children}
			{!!message && (
				<Scramble
					key={message}
					className={cn(
						"type-ui-label text-center",
						messageError ? "text-error" : "text-fg-muted",
					)}
				>
					{message}
				</Scramble>
			)}
		</header>
	);
}
