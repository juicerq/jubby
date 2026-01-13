import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LauncherShell } from '@/core/components/LauncherShell'
import { useDragWindow } from '@/core/hooks/useDragWindow'
import { PluginGrid } from '@/core/components/PluginGrid'
import { PluginHeader } from '@/core/components/PluginHeader'
import { ViewTransition } from '@/core/components/ViewTransition'
import type { PluginManifest } from '@/core/types'
import { plugins } from '@/plugins/registry'

function App() {
  const [activePlugin, setActivePlugin] = useState<PluginManifest | null>(null)

  useDragWindow()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        getCurrentWindow().hide()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // View key changes when switching between grid and plugin views
  const viewKey = activePlugin ? `plugin:${activePlugin.id}` : 'grid'

  return (
    <LauncherShell>
      <ViewTransition viewKey={viewKey}>
        {activePlugin ? (
          <>
            <PluginHeader
              pluginName={activePlugin.name}
              pluginIcon={activePlugin.icon}
              onBack={() => setActivePlugin(null)}
            />
            <div className="flex-1 overflow-auto">
              <activePlugin.component />
            </div>
          </>
        ) : (
          <PluginGrid plugins={plugins} onPluginClick={setActivePlugin} />
        )}
      </ViewTransition>
    </LauncherShell>
  )
}

export default App
