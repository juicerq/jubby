import { useMemo } from 'react'
import { createLogger, type Logger } from '@/lib/logger'

export function useLogger(pluginId: string): Logger {
  return useMemo(() => createLogger(pluginId), [pluginId])
}
