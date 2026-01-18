import { Video } from 'lucide-react'
import type { PluginManifest } from '@/core/types'
import { QuickClipPlugin } from './QuickClipPlugin'

export const QuickClipManifest: PluginManifest = {
  id: 'quickclip',
  name: 'QuickClip',
  description: 'Quick screen recording for sharing',
  icon: Video,
  component: QuickClipPlugin,
  version: '1.0.0',
  capabilities: {
    canCreateWindow: true,
    nativeFeatures: ['screen-capture', 'global-shortcut', 'clipboard-video'],
  },
}
