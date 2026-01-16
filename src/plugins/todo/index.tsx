import { Check } from 'lucide-react'
import type { PluginManifest } from '@/core/types'
import { TodoPlugin } from './TodoPlugin'

export const TodoManifest: PluginManifest = {
  id: 'todo',
  name: 'Todo',
  description: 'Manage tasks with tags and status tracking',
  icon: Check,
  component: TodoPlugin,
  version: '1.0.0',
}
