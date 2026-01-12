import { Button } from '@/components/ui/button'

interface PluginHeaderProps {
  pluginName: string
  onBack: () => void
}

export function PluginHeader({ pluginName, onBack }: PluginHeaderProps) {
  return (
    <header className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onBack}
        aria-label="Voltar para o grid"
      >
        ←
      </Button>
      <h1 className="text-sm font-medium">{pluginName}</h1>
    </header>
  )
}
