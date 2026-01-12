import { Button } from '@/components/ui/button'

interface PluginHeaderProps {
  pluginName: string
  onBack: () => void
}

export function PluginHeader({ pluginName, onBack }: PluginHeaderProps) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onBack}
        aria-label="Voltar para o grid"
        className="transition-all duration-150 ease-out active:scale-90"
      >
        ←
      </Button>
      <h1 className="text-sm font-medium">{pluginName}</h1>
    </header>
  )
}
