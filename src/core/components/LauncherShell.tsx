import type { ReactNode } from 'react'

interface LauncherShellProps {
  children: ReactNode
}

export function LauncherShell({ children }: LauncherShellProps) {
  return (
    <main className="launcher-shell flex h-screen flex-col overflow-hidden active:cursor-grabbing">
      {children}
    </main>
  )
}
