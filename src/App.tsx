import { useState } from 'react'
import { LauncherShell } from '@/core/components/LauncherShell'
import { useDragWindow } from '@/core/hooks/useDragWindow'
import { PluginGrid } from '@/core/components/PluginGrid'
import { ViewTransition } from '@/core/components/ViewTransition'
import { Toaster } from '@/components/ui/sonner'
import type { PluginManifest } from '@/core/types'
import { plugins } from '@/plugins/registry'

function App() {
  const [activePlugin, setActivePlugin] = useState<PluginManifest | null>(null)

  useDragWindow()

  // View key changes when switching between grid and plugin views
  const viewKey = activePlugin ? `plugin:${activePlugin.id}` : 'grid'

  return (
    <LauncherShell>
      <ViewTransition viewKey={viewKey}>
        {activePlugin ? (
          <activePlugin.component onExitPlugin={() => setActivePlugin(null)} />
        ) : (
          <PluginGrid plugins={plugins} onPluginClick={setActivePlugin} />
        )}
      </ViewTransition>
      <Toaster />
    </LauncherShell>
  )
}

export default App
