import { Scramble } from "@renderer/components/Scramble";
import { useToast } from "@renderer/components/Toast";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";
import type { EntityEvent } from "@renderer/lib/entity-bus";
import { entityBus } from "@renderer/lib/entity-bus";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

const moods = [
	"neutro",
	"irritado",
	"eufórico",
	"filosófico",
	"preguiçoso",
	"sarcástico",
	"carinhoso",
] as const;

type Mood = (typeof moods)[number];

function pickMood(): Mood {
	return moods[Math.floor(Math.random() * moods.length)];
}

const sprites: Record<string, string> = {
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
const IDLE_MS = 3 * 60 * 1000;
const IDLE_THROTTLE_MS = 1_000;
const MIN_AWAY_MS = 60_000;

const sessionMood = pickMood();
const sessionBootTime = Date.now();

type Reaction = {
	expression: string;
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
	const [liveReaction, setLiveReaction] = useState<Reaction | null>(null);
	const bufferRef = useRef<EntityEvent[]>([]);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const idleFiredRef = useRef(false);
	const awayRef = useRef<number | undefined>();

	const reactMutation = useMutation(
		orpc.entity.react.mutationOptions({
			onSuccess: (data) => {
				if (data.react) {
					setLiveReaction({
						expression: data.expression,
						message: data.message,
					});
				}
			},
			onError: () => {
				setLiveReaction({ expression: "glitched", message: "[SIGNAL LOST]" });
			},
		}),
	);

	const mutateRef = useRef(reactMutation.mutate);
	mutateRef.current = reactMutation.mutate;

	const flush = useCallback(() => {
		const events = bufferRef.current;
		bufferRef.current = [];
		timerRef.current = null;

		if (events.length === 0) return;

		const content: { taskTitle?: string; folderName?: string } = {};
		for (const e of events) {
			if (e.data?.taskTitle) content.taskTitle = e.data.taskTitle;
			if (e.data?.folderName) content.folderName = e.data.folderName;
		}

		mutateRef.current({
			events: events.map((e) => ({
				type: e.type as
					| "boot"
					| "task:created"
					| "task:completed"
					| "idle"
					| "window:return",
				...(e.data ? { data: e.data } : {}),
				timestamp: e.timestamp,
			})),
			session: {
				mood: sessionMood,
				bootTime: sessionBootTime,
				...(awayRef.current ? { awayDuration: awayRef.current } : {}),
			},
			...(Object.keys(content).length > 0 ? { content } : {}),
		});

		awayRef.current = undefined;
	}, []);

	const bootReaction = useQuery({
		...orpc.entity.react.queryOptions({
			input: {
				events: [{ type: "boot" as const, timestamp: sessionBootTime }],
				session: { mood: sessionMood, bootTime: sessionBootTime },
			},
		}),
		staleTime: Number.POSITIVE_INFINITY,
	});

	// Bus subscription (imperative: external event emitter)
	useEffect(() => {
		const unsub = entityBus.on((event) => {
			bufferRef.current.push(event);

			if (!timerRef.current) {
				timerRef.current = setTimeout(flush, BUFFER_MS);
			}
		});

		return () => {
			unsub();
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [flush]);

	// Idle detection + window:return (imperative: DOM event listeners)
	useEffect(() => {
		let focused = document.hasFocus();
		let blurTime: number | null = null;
		let lastReset = 0;

		const resetIdle = () => {
			const now = Date.now();
			if (now - lastReset < IDLE_THROTTLE_MS) return;
			lastReset = now;

			idleFiredRef.current = false;
			if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
			if (!focused) return;

			idleTimerRef.current = setTimeout(() => {
				if (!idleFiredRef.current && focused) {
					idleFiredRef.current = true;
					entityBus.emit("idle");
				}
			}, IDLE_MS);
		};

		const handleBlur = () => {
			focused = false;
			blurTime = Date.now();
			if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
		};

		const handleFocus = () => {
			focused = true;
			if (blurTime) {
				const away = Date.now() - blurTime;
				if (away > MIN_AWAY_MS) {
					awayRef.current = away;
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
			document.removeEventListener("mousemove", resetIdle);
			document.removeEventListener("keydown", resetIdle);
			document.removeEventListener("click", resetIdle);
			window.removeEventListener("blur", handleBlur);
			window.removeEventListener("focus", handleFocus);
			if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
		};
	}, []);

	const bootData = bootReaction.data?.react
		? {
				expression: bootReaction.data.expression,
				message: bootReaction.data.message,
			}
		: null;
	const reaction = liveReaction ?? bootData;

	if (bootReaction.isLoading && !reaction) {
		return <EntityShell sprite={sprites.neutral} message="inicializando..." />;
	}

	if (!reaction) {
		return <EntityShell sprite={sprites.neutral} />;
	}

	return (
		<EntityShell
			sprite={sprites[reaction.expression] ?? sprites.neutral}
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
		<header className="flex flex-col gap-2 border-b border-border px-3 py-3">
			<div className="flex items-center gap-2">
				<span className="font-pixel text-fg-dim text-lg">
					{sprites.glitched}
				</span>
				<span className="type-h2 text-fg-dim">JUBBY</span>
			</div>
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
}: {
	sprite: string;
	message?: string | null;
	glitched?: boolean;
}) {
	return (
		<header className="flex flex-col gap-1 border-b border-border px-3 py-3">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"font-pixel text-lg",
						glitched ? "text-error animate-pulse" : "text-accent",
					)}
				>
					{sprite}
				</span>
				<span className="type-h2 text-accent">JUBBY</span>
			</div>
			{!!message && (
				<Scramble
					key={message}
					className={cn(
						"type-ui-label",
						glitched ? "text-error" : "text-fg-muted",
					)}
				>
					{message}
				</Scramble>
			)}
		</header>
	);
}
