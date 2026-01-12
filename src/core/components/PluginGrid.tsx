import { Card, CardContent } from '@/components/ui/card'
import type { PluginManifest } from '@/core/types'
import { plugins } from '@/plugins/registry'

interface PluginGridProps {
  onPluginClick?: (plugin: PluginManifest) => void
}

export function PluginGrid({ onPluginClick }: PluginGridProps) {
  if (plugins.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">Nenhum plugin disponível</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      {plugins.map((plugin) => (
        <Card
          key={plugin.id}
          className="cursor-pointer transition-all duration-150 ease-out hover:bg-accent active:scale-95"
          onClick={() => onPluginClick?.(plugin)}
        >
          <CardContent className="flex flex-col items-center justify-center gap-2 p-4">
            <span className="text-3xl transition-transform duration-150 ease-out group-hover:scale-110">{plugin.icon}</span>
            <span className="text-center text-sm font-medium">{plugin.name}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
