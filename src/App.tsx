import { useState } from 'react'
import { PluginGrid } from '@/core/components/PluginGrid'
import { PluginHeader } from '@/core/components/PluginHeader'
import type { PluginManifest } from '@/core/types'

function App() {
  const [activePlugin, setActivePlugin] = useState<PluginManifest | null>(null)

  return (
    <main className="flex min-h-screen flex-col bg-background">
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
