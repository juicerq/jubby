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
          #151517 0%, #151516 2%, #141416 4%, #141415 6%, #131415 8%,
          #131314 10%, #131314 12%, #121313 14%, #121213 16%, #111212 18%,
          #111112 20%, #111111 22%, #101111 24%, #101010 26%, #0f1010 28%,
          #0f0f10 30%, #0f0f0f 32%, #0e0f0f 34%, #0e0e0e 36%, #0d0e0e 38%,
          #0d0d0e 40%, #0d0d0d 42%, #0c0d0d 44%, #0c0c0c 46%, #0b0c0c 48%,
          #0b0b0c 50%, #0b0b0b 52%, #0a0b0b 54%, #0a0a0a 56%, #0a0a0a 58%,
          #090a0a 60%, #090909 62%, #090909 64%, #080909 66%, #080808 68%,
          #080808 70%, #070808 72%, #070707 74%, #070707 76%, #060707 78%,
          #060606 80%, #060606 82%, #060606 84%, #060606 86%, #060606 88%,
          #060606 90%, #060606 92%, #060606 94%, #060606 96%, #060606 98%,
          #060606 100%
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
