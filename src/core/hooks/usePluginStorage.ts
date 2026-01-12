import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface UsePluginStorageReturn<T> {
  data: T
  setData: (value: T | ((prev: T) => T)) => void
  isLoading: boolean
}

export function usePluginStorage<T>(
  pluginId: string,
  defaultValue: T
): UsePluginStorageReturn<T> {
  const [data, setDataInternal] = useState<T>(defaultValue)
  const [isLoading, setIsLoading] = useState(true)

  // Load data from storage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const stored = await invoke<string | null>('read_plugin_data', {
          pluginId,
        })
        if (stored !== null) {
          setDataInternal(JSON.parse(stored) as T)
        }
      } catch (error) {
        console.error(`Failed to load data for plugin ${pluginId}:`, error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [pluginId])

  // Save data to storage
  const setData = useCallback(
    (value: T | ((prev: T) => T)) => {
      setDataInternal((prev) => {
        const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value

        // Save to storage asynchronously
        invoke('write_plugin_data', {
          pluginId,
          data: JSON.stringify(newValue),
        }).catch((error) => {
          console.error(`Failed to save data for plugin ${pluginId}:`, error)
        })

        return newValue
      })
    },
    [pluginId]
  )

  return { data, setData, isLoading }
}
