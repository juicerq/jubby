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
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 12L6 8L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
