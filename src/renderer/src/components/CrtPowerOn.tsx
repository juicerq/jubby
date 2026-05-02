type CrtPowerOnProps = {
	onComplete: () => void;
};

export function CrtPowerOn({ onComplete }: CrtPowerOnProps) {
	return (
		<div
			className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
			aria-hidden
		>
			<div className="crt-bar crt-bar-top absolute inset-x-0 top-0 h-1/2 bg-bg" />
			<div className="crt-bar crt-bar-bottom absolute inset-x-0 bottom-0 h-1/2 bg-bg" />
			<div className="crt-edge crt-edge-top absolute inset-x-0 h-[2px] bg-accent" />
			<div
				className="crt-edge crt-edge-bottom absolute inset-x-0 h-[2px] bg-accent"
				onAnimationEnd={onComplete}
			/>
			<div className="crt-line absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-accent" />
		</div>
	);
}
