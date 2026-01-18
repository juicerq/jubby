import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import type { AudioMode, Recording, ResolutionScale, Framerate } from './types'
import { useQuickClipStorage } from './useQuickClipStorage'
import { createLogger } from '@/lib/logger'

const log = createLogger('quickclip')

interface MonitorInfo {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  isPrimary: boolean
}

interface CaptureSourcesResponse {
  monitors: MonitorInfo[]
  windows: Array<{
    id: number
    title: string
    appName: string
    x: number
    y: number
    width: number
    height: number
    isMinimized: boolean
  }>
}

interface RecordingStatus {
  isRecording: boolean
  frameCount: number
  elapsedSeconds: number
}

interface UseQuickClipReturn {
  isRecording: boolean
  isPreparing: boolean
  isEncoding: boolean
  recordingStatus: RecordingStatus | null
  monitors: MonitorInfo[]
  ffmpegAvailable: boolean | null

  recordings: Recording[]
  isLoadingRecordings: boolean

  startRecording: (audioMode?: AudioMode, resolution?: ResolutionScale, framerate?: Framerate) => Promise<void>
  stopRecording: () => Promise<Recording | null>
  deleteRecording: (id: string) => Promise<void>
  refreshSources: () => Promise<void>
  checkFfmpeg: () => Promise<boolean>
}

export function useQuickClip(): UseQuickClipReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isEncoding, setIsEncoding] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null)

  // Ref to track intentional stop (prevents false "stopped unexpectedly" during user-initiated stop)
  const isStoppingRef = useRef(false)

  const {
    recordings,
    isLoading: isLoadingRecordings,
    deleteRecording,
    refreshRecordings,
  } = useQuickClipStorage()

  const checkFfmpeg = useCallback(async () => {
    try {
      const available = await invoke<boolean>('recorder_check_ffmpeg')
      setFfmpegAvailable(available)
      log.info('FFmpeg availability checked', { available })
      return available
    } catch (error) {
      log.error('Failed to check FFmpeg', { error: String(error) })
      setFfmpegAvailable(false)
      return false
    }
  }, [])

  const refreshSources = useCallback(async () => {
    try {
      const sources = await invoke<CaptureSourcesResponse>('capture_get_sources')
      setMonitors(sources.monitors)
      log.debug('Capture sources refreshed', { monitorCount: sources.monitors.length })
    } catch (error) {
      log.error('Failed to get capture sources', { error: String(error) })
      toast.error('Failed to get capture sources')
    }
  }, [])

  const startRecording = useCallback(async (
    audioMode: AudioMode = 'none',
    resolution: ResolutionScale = '720p',
    framerate: Framerate = '30'
  ) => {
    log.info('Starting recording', { audioMode, resolution, framerate })
    setIsPreparing(true)

    try {
      await invoke('recorder_start', {
        resolutionScale: resolution,
        framerate,
        audioMode,
      })

      setIsRecording(true)
      log.info('Recording started successfully')
    } catch (error) {
      const errorStr = String(error)
      log.error('Failed to start recording', { error: errorStr })
      // Don't show error toast if user cancelled the portal dialog
      if (!errorStr.includes('UserCancelled') && !errorStr.includes('user cancelled')) {
        toast.error(`Failed to start recording: ${error}`)
      }
    } finally {
      setIsPreparing(false)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!isRecording) return null

    log.info('Stopping recording...')
    isStoppingRef.current = true
    setIsEncoding(true)

    try {
      // recorder_stop now returns Recording (already saved by backend)
      const recording = await invoke<Recording>('recorder_stop')
      setIsRecording(false)

      log.info('Recording stopped and saved', { id: recording.id })

      // Refresh recordings list to show the new one
      await refreshRecordings()

      toast.success('Recording saved!')
      return recording
    } catch (error) {
      log.error('Failed to stop recording', { error: String(error) })
      toast.error(`Failed to stop recording: ${error}`)
      return null
    } finally {
      isStoppingRef.current = false
      setIsEncoding(false)
    }
  }, [isRecording, refreshRecordings])

  // Poll recording status while recording
  useEffect(() => {
    if (!isRecording) {
      setRecordingStatus(null)
      return
    }

    const pollStatus = async () => {
      try {
        const status = await invoke<RecordingStatus>('recorder_status')
        setRecordingStatus(status)

        // Sync frontend state with backend (events handle the actual stop notification)
        if (!status.isRecording) {
          setIsRecording(false)
        }
      } catch (error) {
        log.warn('Failed to get recording status', { error: String(error) })
      }
    }

    pollStatus()
    const interval = setInterval(pollStatus, 500)

    return () => clearInterval(interval)
  }, [isRecording])

  // Check FFmpeg on mount
  useEffect(() => {
    checkFfmpeg()
    refreshSources()
  }, [checkFfmpeg, refreshSources])

  // Sync state with backend events (from global shortcut)
  useEffect(() => {
    const unlistenStarted = listen('quickclip:recording-started', () => {
      log.info('Recording started via shortcut')
      setIsPreparing(false)
      setIsRecording(true)
    })

    const unlistenStopped = listen('quickclip:recording-stopped', async () => {
      log.info('Recording stopped via shortcut, refreshing list')
      isStoppingRef.current = true
      setIsRecording(false)
      setIsEncoding(false)
      try {
        await refreshRecordings()
      } catch (e) {
        log.error('Failed to refresh recordings after shortcut stop', { error: String(e) })
      } finally {
        isStoppingRef.current = false
      }
    })

    return () => {
      unlistenStarted.then(fn => fn()).catch(() => {})
      unlistenStopped.then(fn => fn()).catch(() => {})
    }
  }, [refreshRecordings])

  return {
    isRecording,
    isPreparing,
    isEncoding,
    recordingStatus,
    monitors,
    ffmpegAvailable,

    recordings,
    isLoadingRecordings,

    startRecording,
    stopRecording,
    deleteRecording,
    refreshSources,
    checkFfmpeg,
  }
}
