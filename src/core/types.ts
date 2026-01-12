import type { ComponentType } from 'react'

export interface PluginManifest {
  id: string
  name: string
  icon: string
  component: ComponentType
  version: string
}
