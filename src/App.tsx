import { useState, useCallback, useMemo } from 'react'
import { LauncherShell } from '@/core/components/LauncherShell'
import { useDragWindow } from '@/core/hooks/useDragWindow'
import { PluginGrid } from '@/core/components/PluginGrid'
import { ViewTransition } from '@/core/components/ViewTransition'
import { PluginErrorBoundary } from '@/core/components/PluginErrorBoundary'
import { Settings } from '@/core/components/Settings/Settings'
import { Toaster } from '@/components/ui/sonner'
import { NavigationProvider } from '@/core/context/NavigationContext'
import type { PluginManifest } from '@/core/types'
import { plugins } from '@/plugins/registry'

type View =
  | { type: 'grid' }
  | { type: 'plugin'; plugin: PluginManifest }
  | { type: 'settings' }

function App() {
  const [view, setView] = useState<View>({ type: 'grid' })

  useDragWindow()

  const goToGrid = useCallback(() => setView({ type: 'grid' }), [])
  const goToPlugin = useCallback((plugin: PluginManifest) => setView({ type: 'plugin', plugin }), [])
  const goToSettings = useCallback(() => setView({ type: 'settings' }), [])

  const rootLevel = useMemo(
    () => ({ id: 'home', label: 'Jubby', onNavigate: goToGrid }),
    [goToGrid]
  )

  // View key changes when switching between views
  const viewKey =
    view.type === 'plugin'
      ? `plugin:${view.plugin.id}`
      : view.type === 'settings'
        ? 'settings'
        : 'grid'

  return (
    <NavigationProvider rootLevel={rootLevel}>
      <LauncherShell>
        <ViewTransition viewKey={viewKey}>
          {view.type === 'plugin' ? (
            <PluginErrorBoundary pluginName={view.plugin.name} onError={goToGrid}>
              <view.plugin.component onExitPlugin={goToGrid} />
            </PluginErrorBoundary>
          ) : view.type === 'settings' ? (
            <Settings />
          ) : (
            <PluginGrid
              plugins={plugins}
              onPluginClick={goToPlugin}
              onSettingsClick={goToSettings}
            />
          )}
        </ViewTransition>
        <Toaster />
      </LauncherShell>
    </NavigationProvider>
  )
}

export default App
