import type { PluginManifest } from '@/core/types'

function PlaceholderPlugin() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">Placeholder Plugin</p>
    </div>
  )
}

export const PlaceholderManifest: PluginManifest = {
  id: 'placeholder',
  name: 'Placeholder',
  icon: '🔧',
  component: PlaceholderPlugin,
  version: '1.0.0',
}
