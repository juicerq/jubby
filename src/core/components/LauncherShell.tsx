import type { ReactNode } from 'react'

interface LauncherShellProps {
  children: ReactNode
}

export function LauncherShell({ children }: LauncherShellProps) {
  return (
    <main
      className="flex h-screen flex-col overflow-hidden active:cursor-grabbing rounded-xl border border-white/8 shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_25px_50px_-12px_rgba(0,0,0,0.5)]"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255, 255, 255, 0.03) 0%, transparent 70%), #0a0a0a',
      }}
    >
      {children}
    </main>
  )
}
