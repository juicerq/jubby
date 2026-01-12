import type { PluginManifest } from '@/core/types'

function TodoApp() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">Todo Plugin</p>
    </div>
  )
}

export const TodoManifest: PluginManifest = {
  id: 'todo',
  name: 'Todo',
  icon: '✓',
  component: TodoApp,
  version: '1.0.0',
}
