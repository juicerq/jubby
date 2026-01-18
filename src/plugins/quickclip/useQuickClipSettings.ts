import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { BitrateMode, ResolutionScale, AudioMode, Framerate } from './types'
import { DEFAULT_SETTINGS } from './types'
import { createLogger } from '@/lib/logger'

const log = createLogger('quickclip')

interface PersistedSettings {
  bitrateMode: BitrateMode
  resolution: ResolutionScale
  audioMode: AudioMode
  framerate: Framerate
  hotkey: string
}

interface UseQuickClipSettingsReturn {
  settings: PersistedSettings
  isLoading: boolean
  updateSettings: (settings: Partial<PersistedSettings>) => Promise<void>
}

export function useQuickClipSettings(): UseQuickClipSettingsReturn {
  const [settings, setSettings] = useState<PersistedSettings>({
    bitrateMode: DEFAULT_SETTINGS.bitrateMode,
    resolution: DEFAULT_SETTINGS.resolution,
    audioMode: DEFAULT_SETTINGS.audioMode,
    framerate: DEFAULT_SETTINGS.framerate,
    hotkey: DEFAULT_SETTINGS.hotkey,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await invoke<PersistedSettings>('quickclip_get_settings')
        setSettings(data)
        log.debug('Settings loaded', { ...data })
      } catch (error) {
        log.error('Failed to load settings', { error: String(error) })
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  const updateSettings = useCallback(async (partial: Partial<PersistedSettings>) => {
    const newSettings = { ...settings, ...partial }

    // Optimistic update
    setSettings(newSettings)

    try {
      await invoke('quickclip_update_settings', { settings: newSettings })
      log.debug('Settings saved', { ...newSettings })
    } catch (error) {
      // Rollback on error
      setSettings(settings)
      log.error('Failed to save settings', { error: String(error) })
      toast.error('Failed to save settings')
    }
  }, [settings])

  return {
    settings,
    isLoading,
    updateSettings,
  }
}
