import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { AppSettings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

interface UseSettingsReturn {
  settings: AppSettings
  isLoading: boolean
  updateShortcut: (shortcut: string) => Promise<boolean>
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await invoke<AppSettings>('get_settings')
        setSettings(data)
      } catch (error) {
        console.error('Failed to load settings:', error)
        toast.error('Failed to load settings')
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  const updateShortcut = useCallback(async (shortcut: string): Promise<boolean> => {
    const previousSettings = settings

    setSettings((prev) => ({ ...prev, globalShortcut: shortcut }))

    try {
      await invoke('update_global_shortcut', { shortcut })
      toast.success('Shortcut updated')
      return true
    } catch (error) {
      setSettings(previousSettings)
      console.error('Failed to update shortcut:', error)
      toast.error('Failed to update shortcut')
      return false
    }
  }, [settings])

  return {
    settings,
    isLoading,
    updateShortcut,
  }
}
