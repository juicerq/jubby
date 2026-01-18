import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { Recording, AudioMode } from './types'
import { createLogger } from '@/lib/logger'

const log = createLogger('quickclip')

interface UseQuickClipStorageReturn {
  recordings: Recording[]
  isLoading: boolean

  saveRecording: (params: SaveRecordingParams) => Promise<Recording | null>
  deleteRecording: (id: string) => Promise<void>
  refreshRecordings: () => Promise<void>
}

interface SaveRecordingParams {
  id: string
  videoPath: string
  thumbnailPath: string
  duration: number
  timestamp: number
  audioMode: AudioMode
}

export function useQuickClipStorage(): UseQuickClipStorageReturn {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refreshRecordings = useCallback(async () => {
    try {
      const data = await invoke<Recording[]>('quickclip_get_recordings')
      setRecordings(data)
      log.debug('Recordings loaded', { count: data.length })
    } catch (error) {
      log.error('Failed to load recordings', { error: String(error) })
      toast.error('Failed to load recordings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshRecordings()
  }, [refreshRecordings])

  const saveRecording = useCallback(async (params: SaveRecordingParams) => {
    try {
      log.debug('Saving recording metadata', { id: params.id })
      const recording = await invoke<Recording>('quickclip_save_recording', {
        id: params.id,
        videoPath: params.videoPath,
        thumbnailPath: params.thumbnailPath,
        duration: params.duration,
        timestamp: params.timestamp,
        audioMode: params.audioMode,
      })

      // Add to state (already sorted newest first from backend)
      setRecordings((prev) => [recording, ...prev])

      log.info('Recording metadata saved', { id: recording.id })
      return recording
    } catch (error) {
      log.error('Failed to save recording', { error: String(error) })
      toast.error('Failed to save recording')
      return null
    }
  }, [])

  const deleteRecording = useCallback(async (id: string) => {
    log.info('Deleting recording', { id })
    // Optimistic update
    let previousRecordings: Recording[] = []

    setRecordings((prev) => {
      previousRecordings = prev
      return prev.filter((r) => r.id !== id)
    })

    try {
      await invoke('quickclip_delete_recording', { id })
      log.info('Recording deleted', { id })
      toast.success('Recording deleted')
    } catch (error) {
      // Rollback on error
      setRecordings(previousRecordings)
      log.error('Failed to delete recording', { id, error: String(error) })
      toast.error('Failed to delete recording')
    }
  }, [])

  return {
    recordings,
    isLoading,
    saveRecording,
    deleteRecording,
    refreshRecordings,
  }
}
