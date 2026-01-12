import type { PluginManifest } from '@/core/types'
import { PlaceholderManifest } from './placeholder'
import { TodoManifest } from './todo'

export const plugins: PluginManifest[] = [TodoManifest, PlaceholderManifest]
