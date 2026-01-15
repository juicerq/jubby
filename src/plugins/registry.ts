import type { PluginManifest } from '@/core/types'
import { TodoManifest } from './todo'
import { PromptEnhancerManifest } from './prompt-enhancer'

export const plugins: PluginManifest[] = [TodoManifest, PromptEnhancerManifest]
