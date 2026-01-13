import { ChevronLeft } from 'lucide-react'

interface PluginHeaderProps {
  pluginName: string
  pluginIcon?: string
  onBack: () => void
}

export function PluginHeader({ pluginName, pluginIcon, onBack }: PluginHeaderProps) {
  return (
    <header className="plugin-header">
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar para o grid"
        className="plugin-header__back"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      <div className="plugin-header__title">
        {pluginIcon && (
          <span className="plugin-header__icon">{pluginIcon}</span>
        )}
        <h1 className="plugin-header__name">{pluginName}</h1>
      </div>

      {/* Spacer to balance the back button for centered title */}
      <div className="w-8" aria-hidden="true" />
    </header>
  )
}
