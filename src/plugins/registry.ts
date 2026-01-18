import type { PluginManifest } from '@/core/types'
import { TodoManifest } from './todo'
import { PromptEnhancerManifest } from './prompt-enhancer'
import { QuickClipManifest } from './quickclip'

export const plugins: PluginManifest[] = [TodoManifest, PromptEnhancerManifest, QuickClipManifest]
