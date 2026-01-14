import { useState } from 'react'
import { LauncherShell } from '@/core/components/LauncherShell'
import { useDragWindow } from '@/core/hooks/useDragWindow'
import { PluginGrid } from '@/core/components/PluginGrid'
import { PluginHeader } from '@/core/components/PluginHeader'
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
          <>
            <PluginHeader
              title={activePlugin.name}
              icon={activePlugin.icon}
              onBack={() => setActivePlugin(null)}
            />
            <div className="flex-1 overflow-y-auto">
              <activePlugin.component onExitPlugin={() => setActivePlugin(null)} />
            </div>
          </>
        ) : (
          <PluginGrid plugins={plugins} onPluginClick={setActivePlugin} />
        )}
      </ViewTransition>
      <Toaster />
    </LauncherShell>
  )
}

export default App
