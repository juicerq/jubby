import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { Recording, CaptureMode, AudioMode, QualityMode } from './types'

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
  captureMode: CaptureMode
  audioMode: AudioMode
  qualityMode: QualityMode
}

export function useQuickClipStorage(): UseQuickClipStorageReturn {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refreshRecordings = useCallback(async () => {
    try {
      const data = await invoke<Recording[]>('quickclip_get_recordings')
      setRecordings(data)
    } catch (error) {
      console.error('Failed to load recordings:', error)
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
      const recording = await invoke<Recording>('quickclip_save_recording', {
        id: params.id,
        videoPath: params.videoPath,
        thumbnailPath: params.thumbnailPath,
        duration: params.duration,
        timestamp: params.timestamp,
        captureMode: params.captureMode,
        audioMode: params.audioMode,
        qualityMode: params.qualityMode,
      })

      // Add to state (already sorted newest first from backend)
      setRecordings((prev) => [recording, ...prev])

      return recording
    } catch (error) {
      console.error('Failed to save recording:', error)
      toast.error('Failed to save recording')
      return null
    }
  }, [])

  const deleteRecording = useCallback(async (id: string) => {
    // Optimistic update
    let previousRecordings: Recording[] = []

    setRecordings((prev) => {
      previousRecordings = prev
      return prev.filter((r) => r.id !== id)
    })

    try {
      await invoke('quickclip_delete_recording', { id })
      toast.success('Recording deleted')
    } catch (error) {
      // Rollback on error
      setRecordings(previousRecordings)
      console.error('Failed to delete recording:', error)
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
