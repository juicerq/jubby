import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { QualityMode } from './types'

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

  startRecording: (monitorId?: string, quality?: QualityMode) => Promise<void>
  stopRecording: () => Promise<RecordingResult | null>
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

  const checkFfmpeg = useCallback(async () => {
    try {
      const available = await invoke<boolean>('recorder_check_ffmpeg')
      setFfmpegAvailable(available)
      return available
    } catch (error) {
      console.error('Failed to check FFmpeg:', error)
      setFfmpegAvailable(false)
      return false
    }
  }, [])

  const refreshSources = useCallback(async () => {
    try {
      const sources = await invoke<CaptureSourcesResponse>('capture_get_sources')
      setMonitors(sources.monitors)
    } catch (error) {
      console.error('Failed to get capture sources:', error)
      toast.error('Failed to get capture sources')
    }
  }, [])

  const startRecording = useCallback(async (monitorId?: string, quality: QualityMode = 'light') => {
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
      }

      await invoke('recorder_start', {
        monitorId: targetMonitorId,
        quality,
        fps: 30,
      })

      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
      toast.error(`Failed to start recording: ${error}`)
    } finally {
      setIsPreparing(false)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!isRecording) return null

    setIsEncoding(true)

    try {
      const result = await invoke<RecordingResult>('recorder_stop')
      setIsRecording(false)
      return result
    } catch (error) {
      console.error('Failed to stop recording:', error)
      toast.error(`Failed to stop recording: ${error}`)
      return null
    } finally {
      setIsEncoding(false)
    }
  }, [isRecording])

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
        console.error('Failed to get recording status:', error)
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
    startRecording,
    stopRecording,
    refreshSources,
    checkFfmpeg,
  }
}
