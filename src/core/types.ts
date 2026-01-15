import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export type WindowType = 'popover' | 'overlay' | 'window'

export interface PluginCapabilities {
  canCreateWindow?: boolean
  requiresOverlay?: boolean
  nativeFeatures?: string[]
}

export interface PluginManifest {
  id: string
  name: string
  icon: LucideIcon
  component: ComponentType<PluginProps>
  version: string
  capabilities?: PluginCapabilities
}

export interface PluginProps {
  onExitPlugin: () => void
}
