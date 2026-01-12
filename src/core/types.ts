import type { ComponentType } from 'react'

export type WindowType = 'popover' | 'overlay' | 'window'

export interface PluginCapabilities {
  canCreateWindow?: boolean
  requiresOverlay?: boolean
  nativeFeatures?: string[]
}

export interface PluginManifest {
  id: string
  name: string
  icon: string
  component: ComponentType
  version: string
  capabilities?: PluginCapabilities
}
