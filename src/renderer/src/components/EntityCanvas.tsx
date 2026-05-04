import type { EntityExpression } from "@shared/entity-constants";
import { useEffect, useRef } from "react";

const SCALE = 4;
const W = 24;
const H = 12;

const palette: Record<string, string | null> = {
	".": null,
	"#": "--color-fg-muted",
	"=": "--color-fg-dim",
	o: "--color-fg",
	v: "--color-border-strong",
	r: "--color-error",
};

const reelCenter = "oooo=oooo";
const reelLeft = "ooo=ooooo";
const reelRight = "ooooo=ooo";
const reelClosed = "===ooo===";

const reelHappy = "=o=ooo=o=";
const reelExcited = "ooooooooo";
const reelGrumpy = "###o=o===";
const reelCurious = "o=ooo=ooo";
const reelShocked = "oooovoooo";
const reelGlitched = "ror=#=r=r";

const expressionReel: Record<EntityExpression, string> = {
	neutral: reelCenter,
	happy: reelHappy,
	excited: reelExcited,
	sleepy: reelClosed,
	grumpy: reelGrumpy,
	curious: reelCurious,
	shocked: reelShocked,
	glitched: reelGlitched,
};

const lookSchedule = [
	{ reel: reelCenter, duration: 1200 },
	{ reel: reelLeft, duration: 500 },
	{ reel: reelCenter, duration: 800 },
	{ reel: reelRight, duration: 500 },
] as const;

const LOOK_TOTAL_MS = lookSchedule.reduce((sum, s) => sum + s.duration, 0);

const spinSequence = [
	"=oooooooo",
	"o=ooooooo",
	"oo=oooooo",
	"ooooo=ooo",
	"oooooooo=",
	"ooooooo=o",
	"oooooo=oo",
	"ooo=ooooo",
] as const;

const SPIN_STEP_MS = 100;

type Mode = "idle" | "looking_around" | "sleeping" | "moving" | EntityExpression;

function reelRow(rl: string, rr: string): string {
	return `#=#==${rl}========${rr}==#=#`;
}

function frameOf(reelL: string, reelR: string): string[] {
	return [
		"########################",
		"#======================#",
		"#=####################=#",
		"#=#==================#=#",
		reelRow(reelL.slice(0, 3), reelR.slice(0, 3)),
		reelRow(reelL.slice(3, 6), reelR.slice(3, 6)),
		reelRow(reelL.slice(6, 9), reelR.slice(6, 9)),
		"#=#=======vvvv=======#=#",
		"#=####################=#",
		"#======================#",
		"########################",
		"........................",
	];
}

function pickLookReel(time: number): string {
	const t = ((time % LOOK_TOTAL_MS) + LOOK_TOTAL_MS) % LOOK_TOTAL_MS;
	let acc = 0;
	for (const step of lookSchedule) {
		acc += step.duration;
		if (t < acc) {
			return step.reel;
		}
	}
	return reelCenter;
}

function pickSpinReel(time: number): string {
	const len = spinSequence.length;
	const idx = ((Math.floor(time / SPIN_STEP_MS) % len) + len) % len;
	return spinSequence[idx];
}

function composeFrame(mode: Mode, time: number): string[] {
	if (mode === "looking_around") {
		const reel = pickLookReel(time);
		return frameOf(reel, reel);
	}
	if (mode === "moving") {
		const reel = pickSpinReel(time);
		return frameOf(reel, reel);
	}
	if (mode === "sleeping") {
		return frameOf(reelClosed, reelClosed);
	}
	if (mode === "idle") {
		return frameOf(reelCenter, reelCenter);
	}
	const reel = expressionReel[mode];
	return frameOf(reel, reel);
}

function resolveRgb(varName: string): [number, number, number] {
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(varName)
		.trim();
	const hex = value.startsWith("#") ? value.slice(1) : value;
	return [
		Number.parseInt(hex.slice(0, 2), 16),
		Number.parseInt(hex.slice(2, 4), 16),
		Number.parseInt(hex.slice(4, 6), 16),
	];
}

type EntityCanvasProps = {
	mode: Mode;
	className?: string;
};

export function EntityCanvas({ mode, className }: EntityCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	// canvas é API imperativa: RAF loop pintando putImageData direto no contexto 2D.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		const colors: Record<string, [number, number, number] | null> = {};
		for (const [glyph, varName] of Object.entries(palette)) {
			colors[glyph] = varName ? resolveRgb(varName) : null;
		}

		const image = ctx.createImageData(W, H);
		const start = performance.now();
		let raf = 0;

		const render = (now: number) => {
			const frame = composeFrame(mode, now - start);

			for (let y = 0; y < H; y++) {
				const row = frame[y];
				for (let x = 0; x < W; x++) {
					const glyph = row[x];
					const rgb = colors[glyph];
					const offset = (y * W + x) * 4;
					if (!rgb) {
						image.data[offset + 3] = 0;
						continue;
					}
					image.data[offset] = rgb[0];
					image.data[offset + 1] = rgb[1];
					image.data[offset + 2] = rgb[2];
					image.data[offset + 3] = 255;
				}
			}

			ctx.putImageData(image, 0, 0);
			raf = requestAnimationFrame(render);
		};

		raf = requestAnimationFrame(render);

		return () => cancelAnimationFrame(raf);
	}, [mode]);

	return (
		<canvas
			className={className}
			ref={canvasRef}
			width={W}
			height={H}
			style={{
				width: W * SCALE,
				height: H * SCALE,
				imageRendering: "pixelated",
			}}
		/>
	);
}
