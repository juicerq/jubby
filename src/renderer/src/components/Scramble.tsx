import { useEffect, useMemo, useState } from "react";

const FRAME_MS = 26;
const CHAR_DELAY_FRAMES = 2;
const SCRAMBLE_FRAMES = 6;
const TEASE_FRAMES = 4;
const FLASH_FRAMES = 2;
const JITTER_FRAMES = 2;

const BLOCK_CHARS = "█▓▒░";
const SYMBOL_CHARS = "#@%&*+=/<>?!$";
const ALPHA_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type Phase = "idle" | "scramble" | "tease" | "flash" | "locked";

type CharState =
	| { kind: "space" }
	| { kind: "anim"; char: string; phase: Phase };

type ScrambleProps = {
	children: string;
	className?: string;
};

const phaseClass: Record<Phase, string | undefined> = {
	idle: "text-fg-dim",
	scramble: "text-accent-dim",
	tease: "text-accent",
	flash: "text-fg",
	locked: undefined,
};

const pickFrom = (chars: string) =>
	chars[Math.floor(Math.random() * chars.length)];

const computeChar = (
	target: string,
	index: number,
	frame: number,
	jitter: number,
): CharState => {
	if (target === " ") {
		return { kind: "space" };
	}

	const start = index * CHAR_DELAY_FRAMES + jitter;

	if (frame < start) {
		return { kind: "anim", char: pickFrom(BLOCK_CHARS), phase: "idle" };
	}

	const scrambleEnd = start + SCRAMBLE_FRAMES;

	if (frame < scrambleEnd) {
		return { kind: "anim", char: pickFrom(SYMBOL_CHARS), phase: "scramble" };
	}

	const teaseEnd = scrambleEnd + TEASE_FRAMES;

	if (frame < teaseEnd) {
		const progress = (frame - scrambleEnd) / TEASE_FRAMES;
		const showCorrect = Math.random() < 0.3 + progress * 0.6;

		return {
			kind: "anim",
			char: showCorrect ? target : pickFrom(ALPHA_CHARS),
			phase: "tease",
		};
	}

	const flashEnd = teaseEnd + FLASH_FRAMES;

	if (frame < flashEnd) {
		return { kind: "anim", char: target, phase: "flash" };
	}

	return { kind: "anim", char: target, phase: "locked" };
};

const idleState = (text: string): CharState[] =>
	text.split("").map((c) =>
		c === " "
			? { kind: "space" }
			: { kind: "anim", char: pickFrom(BLOCK_CHARS), phase: "idle" },
	);

const finalState = (text: string): CharState[] =>
	text.split("").map((c) =>
		c === " " ? { kind: "space" } : { kind: "anim", char: c, phase: "locked" },
	);

export function Scramble({ children, className }: ScrambleProps) {
	const jitter = useMemo(
		() =>
			children
				.split("")
				.map(() => Math.floor(Math.random() * (JITTER_FRAMES + 1))),
		[children],
	);

	const totalFrames = useMemo(() => {
		let maxStart = 0;

		for (let i = 0; i < children.length; i++) {
			const start = i * CHAR_DELAY_FRAMES + jitter[i];

			if (start > maxStart) {
				maxStart = start;
			}
		}

		return maxStart + SCRAMBLE_FRAMES + TEASE_FRAMES + FLASH_FRAMES;
	}, [children, jitter]);

	const [chars, setChars] = useState<CharState[]>(() => idleState(children));

	// rAF as external animation clock; not derivable from props/state.
	useEffect(() => {
		const startTime = performance.now();
		let raf = 0;
		let lastFrame = -1;

		const tick = (now: number) => {
			const frame = Math.floor((now - startTime) / FRAME_MS);

			if (frame !== lastFrame) {
				lastFrame = frame;

				if (frame >= totalFrames) {
					setChars(finalState(children));
					return;
				}

				const next: CharState[] = [];

				for (let i = 0; i < children.length; i++) {
					next.push(computeChar(children[i], i, frame, jitter[i]));
				}

				setChars(next);
			}

			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [children, jitter, totalFrames]);

	return (
		<span className={className}>
			{chars.map((c, i) => {
				if (c.kind === "space") {
					return <span key={i}> </span>;
				}

				return (
					<span key={i} className={phaseClass[c.phase]}>
						{c.char}
					</span>
				);
			})}
		</span>
	);
}
