import { Sparkles } from 'lucide-react'
import type { PluginManifest } from '@/core/types'
import { PromptEnhancerPlugin } from './PromptEnhancerPlugin'

export const PromptEnhancerManifest: PluginManifest = {
  id: 'prompt-enhancer',
  name: 'Prompt Enhancer',
  icon: Sparkles,
  component: PromptEnhancerPlugin,
  version: '1.0.0',
}
