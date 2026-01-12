import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PluginGrid } from '@/core/components/PluginGrid'
import { PluginHeader } from '@/core/components/PluginHeader'
import type { PluginManifest } from '@/core/types'

function App() {
  const [activePlugin, setActivePlugin] = useState<PluginManifest | null>(null)

  // Close window on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        getCurrentWindow().hide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <main className="launcher-shell flex h-screen flex-col overflow-hidden">
      {activePlugin ? (
        <>
          <PluginHeader
            pluginName={activePlugin.name}
            onBack={() => setActivePlugin(null)}
          />
          <div className="flex-1 overflow-auto">
            <activePlugin.component />
          </div>
        </>
      ) : (
        <PluginGrid onPluginClick={setActivePlugin} />
      )}
    </main>
  )
}

export default App
