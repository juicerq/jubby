import { useState } from 'react'
import { PluginGrid } from '@/core/components/PluginGrid'
import type { PluginManifest } from '@/core/types'

function App() {
  const [activePlugin, setActivePlugin] = useState<PluginManifest | null>(null)

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {activePlugin ? (
        <activePlugin.component />
      ) : (
        <PluginGrid onPluginClick={setActivePlugin} />
      )}
    </main>
  )
}

export default App
