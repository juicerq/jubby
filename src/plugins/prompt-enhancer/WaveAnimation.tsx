import { useMemo } from 'react'

interface WaveAnimationProps {
  className?: string
}

export function WaveAnimation({ className = '' }: WaveAnimationProps) {
  const waves = useMemo(
    () => [
      { delay: '0s', duration: '3s', opacity: 0.6, amplitude: 12, yOffset: 0 },
      { delay: '0.4s', duration: '3.5s', opacity: 0.4, amplitude: 8, yOffset: 4 },
      { delay: '0.8s', duration: '4s', opacity: 0.25, amplitude: 15, yOffset: -3 },
      { delay: '1.2s', duration: '3.2s', opacity: 0.15, amplitude: 10, yOffset: 6 },
    ],
    []
  )

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <style>
        {`
          @keyframes wave-flow {
            0% {
              transform: translateX(-25%);
            }
            100% {
              transform: translateX(0%);
            }
          }

          @keyframes wave-pulse {
            0%, 100% {
              opacity: var(--wave-opacity);
            }
            50% {
              opacity: calc(var(--wave-opacity) * 1.4);
            }
          }

          @keyframes gradient-shift {
            0% {
              stop-color: rgba(255, 255, 255, 0.9);
            }
            33% {
              stop-color: rgba(200, 210, 255, 0.85);
            }
            66% {
              stop-color: rgba(220, 200, 255, 0.85);
            }
            100% {
              stop-color: rgba(255, 255, 255, 0.9);
            }
          }
        `}
      </style>

      <svg
        viewBox="0 0 200 80"
        className="w-48 h-20"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop
              offset="0%"
              style={{
                stopColor: 'rgba(255, 255, 255, 0.9)',
                animation: 'gradient-shift 6s ease-in-out infinite',
              }}
            />
            <stop
              offset="50%"
              style={{
                stopColor: 'rgba(180, 190, 255, 0.7)',
                animation: 'gradient-shift 6s ease-in-out infinite 2s',
              }}
            />
            <stop
              offset="100%"
              style={{
                stopColor: 'rgba(255, 255, 255, 0.9)',
                animation: 'gradient-shift 6s ease-in-out infinite 4s',
              }}
            />
          </linearGradient>

          <filter id="wave-blur">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>

        {waves.map((wave, i) => (
          <g
            key={i}
            style={
              {
                '--wave-opacity': wave.opacity,
                animation: `wave-flow ${wave.duration} linear infinite, wave-pulse ${wave.duration} ease-in-out infinite`,
                animationDelay: wave.delay,
              } as React.CSSProperties
            }
          >
            <WavePath
              amplitude={wave.amplitude}
              yOffset={40 + wave.yOffset}
              opacity={wave.opacity}
            />
          </g>
        ))}
      </svg>
    </div>
  )
}

function WavePath({
  amplitude,
  yOffset,
  opacity,
}: {
  amplitude: number
  yOffset: number
  opacity: number
}) {
  const points = 32
  const width = 400

  let d = `M 0 ${yOffset}`

  for (let i = 0; i <= points; i++) {
    const x = (i / points) * width
    const phase1 = (i / points) * Math.PI * 4
    const phase2 = (i / points) * Math.PI * 2.5
    const y =
      yOffset +
      Math.sin(phase1) * amplitude * 0.7 +
      Math.sin(phase2 + 1) * amplitude * 0.3

    if (i === 0) {
      d = `M ${x} ${y}`
    } else {
      const prevX = ((i - 1) / points) * width
      const prevPhase1 = ((i - 1) / points) * Math.PI * 4
      const prevPhase2 = ((i - 1) / points) * Math.PI * 2.5
      const prevY =
        yOffset +
        Math.sin(prevPhase1) * amplitude * 0.7 +
        Math.sin(prevPhase2 + 1) * amplitude * 0.3

      const cpX = (prevX + x) / 2
      d += ` Q ${cpX} ${prevY} ${x} ${y}`
    }
  }

  return (
    <path
      d={d}
      fill="none"
      stroke="url(#wave-gradient)"
      strokeWidth={1.5}
      strokeLinecap="round"
      opacity={opacity}
      filter="url(#wave-blur)"
    />
  )
}

export { WaveAnimation as default }
