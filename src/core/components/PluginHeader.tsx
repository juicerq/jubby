import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

interface PluginHeaderProps {
  title: string
  icon?: string
  right?: ReactNode
  onBack: () => void
}

export function PluginHeader({ title, icon, right, onBack }: PluginHeaderProps) {
  return (
    <header className="flex items-center justify-between h-12 px-3 border-b border-white/8 shrink-0">
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar para o grid"
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-transparent text-white/50 cursor-pointer transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] active:bg-white/8"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2">
        {icon && (
          <span className="text-lg leading-none">{icon}</span>
        )}
        <h1 className="text-[13px] font-medium text-white/90 tracking-tight">{title}</h1>
      </div>

      {right ? (
        <div className="flex items-center">{right}</div>
      ) : (
        <div className="w-8" aria-hidden="true" />
      )}
    </header>
  )
}
