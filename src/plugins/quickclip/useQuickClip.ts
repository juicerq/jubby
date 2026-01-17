import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { QualityMode, CaptureMode, AudioMode, Recording } from './types'
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

  startRecording: (monitorId?: string, quality?: QualityMode, captureMode?: CaptureMode, audioMode?: AudioMode) => Promise<void>
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
    monitorId?: string,
    quality: QualityMode = 'light',
    captureMode: CaptureMode = 'fullscreen',
    audioMode: AudioMode = 'none'
  ) => {
    log.info('Starting recording', { monitorId, quality, captureMode, audioMode })
    setIsPreparing(true)

    try {
      // Get primary monitor if no specific one provided
      let targetMonitorId = monitorId
      if (!targetMonitorId) {
        const sources = await invoke<CaptureSourcesResponse>('capture_get_sources')
        const primaryMonitor = sources.monitors.find((m) => m.isPrimary) ?? sources.monitors[0]
        if (!primaryMonitor) {
          throw new Error('No monitors available')
        }
        targetMonitorId = primaryMonitor.id
        log.debug('Auto-selected monitor', { monitorId: targetMonitorId })
      }

      // Store current settings for when we save the recording
      setCurrentSettings({ captureMode, audioMode, qualityMode: quality })

      await invoke('recorder_start', {
        monitorId: targetMonitorId,
        quality,
        fps: 30,
      })

      setIsRecording(true)
      log.info('Recording started successfully')
    } catch (error) {
      log.error('Failed to start recording', { error: String(error) })
      toast.error(`Failed to start recording: ${error}`)
      setCurrentSettings(null)
    } finally {
      setIsPreparing(false)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!isRecording) return null

    log.info('Stopping recording...')
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
