import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { QualityMode, CaptureMode, AudioMode, Recording, ResolutionScale } from './types'
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

interface RecordingResult {
  id: string
  videoPath: string
  thumbnailPath: string
  duration: number
  width: number
  height: number
  frameCount: number
  timestamp: number
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

  startRecording: (quality?: QualityMode, captureMode?: CaptureMode, audioMode?: AudioMode, resolution?: ResolutionScale) => Promise<void>
  stopRecording: () => Promise<Recording | null>
  deleteRecording: (id: string) => Promise<void>
  refreshSources: () => Promise<void>
  checkFfmpeg: () => Promise<boolean>
}

interface CurrentRecordingSettings {
  captureMode: CaptureMode
  audioMode: AudioMode
  qualityMode: QualityMode
}

export function useQuickClip(): UseQuickClipReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isEncoding, setIsEncoding] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null)
  const [currentSettings, setCurrentSettings] = useState<CurrentRecordingSettings | null>(null)

  // Ref to track intentional stop (prevents false "stopped unexpectedly" during user-initiated stop)
  const isStoppingRef = useRef(false)

  const {
    recordings,
    isLoading: isLoadingRecordings,
    saveRecording,
    deleteRecording,
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
    quality: QualityMode = 'light',
    captureMode: CaptureMode = 'fullscreen',
    audioMode: AudioMode = 'none',
    resolution: ResolutionScale = 'p720'
  ) => {
    log.info('Starting recording', { quality, captureMode, audioMode, resolution })
    setIsPreparing(true)

    try {
      // Store current settings for when we save the recording
      setCurrentSettings({ captureMode, audioMode, qualityMode: quality })

      await invoke('recorder_start', {
        quality,
        captureMode,
        resolutionScale: resolution,
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
      setCurrentSettings(null)
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
      const result = await invoke<RecordingResult>('recorder_stop')
      setIsRecording(false)
      log.info('Recording stopped, encoding completed', {
        id: result.id,
        duration: result.duration,
        frameCount: result.frameCount,
      })

      // Save to storage
      const settings = currentSettings ?? {
        captureMode: 'fullscreen' as CaptureMode,
        audioMode: 'none' as AudioMode,
        qualityMode: 'light' as QualityMode,
      }

      const recording = await saveRecording({
        id: result.id,
        videoPath: result.videoPath,
        thumbnailPath: result.thumbnailPath,
        duration: result.duration,
        timestamp: result.timestamp,
        captureMode: settings.captureMode,
        audioMode: settings.audioMode,
        qualityMode: settings.qualityMode,
      })

      setCurrentSettings(null)

      if (recording) {
        log.info('Recording saved to storage', { id: recording.id })
        toast.success('Recording saved!')
      }

      return recording
    } catch (error) {
      log.error('Failed to stop recording', { error: String(error) })
      toast.error(`Failed to stop recording: ${error}`)
      setCurrentSettings(null)
      return null
    } finally {
      isStoppingRef.current = false
      setIsEncoding(false)
    }
  }, [isRecording, currentSettings, saveRecording])

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

        // Sync frontend state with backend - detect unexpected stop
        if (!status.isRecording && !isStoppingRef.current) {
          setIsRecording(false)
          setCurrentSettings(null)
          toast.error('Recording stopped unexpectedly')
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
