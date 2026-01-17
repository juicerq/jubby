import { Video } from 'lucide-react'
import { Breadcrumb } from '@/core/components/Breadcrumb'
import { useNavigationLevels } from '@/core/hooks'
import type { PluginProps } from '@/core/types'
import { DEFAULT_SETTINGS } from './types'

function QuickClipPlugin(_props: PluginProps) {
  useNavigationLevels([{ id: 'quickclip', label: 'QuickClip' }])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Breadcrumb />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <QuickClipEmptyState />
      </div>
    </div>
  )
}

function QuickClipEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Video className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No recordings yet</p>
        <p className="text-xs text-muted-foreground">
          Press <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{DEFAULT_SETTINGS.hotkey}</kbd> to start recording
        </p>
      </div>
      <button className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Start Recording
      </button>
    </div>
  )
}

export { QuickClipPlugin }
