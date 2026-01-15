import type { ReactNode } from 'react'

interface LauncherShellProps {
  children: ReactNode
}

export function LauncherShell({ children }: LauncherShellProps) {
  return (
    <main
      className="relative flex h-screen flex-col overflow-hidden active:cursor-grabbing rounded-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03),0_0_0_1px_rgba(0,0,0,0.9),0_25px_50px_-12px_rgba(0,0,0,0.6)]"
      style={{
        background: `linear-gradient(
          135deg,
          #141416 0%,
          #111113 25%,
          #0e0e10 50%,
          #0c0c0e 75%,
          #0a0a0c 100%
        )`,
      }}
    >
      {/* Noise overlay - very subtle dithering to reduce banding */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.005]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      {children}
    </main>
  )
}
