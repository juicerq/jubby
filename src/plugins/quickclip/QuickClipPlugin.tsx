import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Circle, Square, AlertTriangle, Loader2, Play, Pause, Copy, Check, Trash2, FolderOpen, Film, Settings } from 'lucide-react'
import { Breadcrumb } from '@/core/components/Breadcrumb'
import { useNavigationLevels } from '@/core/hooks'
import type { PluginProps } from '@/core/types'
import { useQuickClip } from './useQuickClip'
import { useQuickClipSettings } from './useQuickClipSettings'
import { QuickClipSettings } from './QuickClipSettings'
import { type Recording } from './types'
import { cn } from '@/lib/utils'
import { createLogger } from '@/lib/logger'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

const log = createLogger('quickclip')

type ViewState = 'recordings' | 'settings'

function QuickClipPlugin(_props: PluginProps) {
  const [view, setView] = useState<ViewState>('recordings')

  const { settings, isLoading: isLoadingSettings, isUpdatingHotkey, updateSettings, setHotkey } = useQuickClipSettings()

  // Only register navigation levels when on recordings view
  // Settings view manages its own navigation
  useNavigationLevels(
    view === 'recordings' ? [{ id: 'quickclip', label: 'QuickClip' }] : []
  )

  const {
    isRecording,
    isPreparing,
    isEncoding,
    recordingStatus,
    ffmpegAvailable,
    recordings,
    isLoadingRecordings,
    startRecording,
    stopRecording,
    deleteRecording,
  } = useQuickClip()

  const handleToggleRecording = async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording(settings.audioMode, settings.resolution, settings.framerate)
    }
  }

  const isBusy = isRecording || isPreparing || isEncoding

  // Settings view
  if (view === 'settings') {
    return (
      <QuickClipSettings
        resolution={settings.resolution}
        onResolutionChange={(res) => updateSettings({ resolution: res })}
        framerate={settings.framerate}
        onFramerateChange={(fps) => updateSettings({ framerate: fps })}
        audioMode={settings.audioMode}
        onAudioModeChange={(mode) => updateSettings({ audioMode: mode })}
        hotkey={settings.hotkey}
        onHotkeyChange={setHotkey}
        isUpdatingHotkey={isUpdatingHotkey}
        onNavigateBack={() => setView('recordings')}
      />
    )
  }

  const settingsButton = (
    <button
      onClick={() => setView('settings')}
      disabled={isBusy}
      className={cn(
        'rounded-lg p-1.5 transition-colors',
        'text-white/40 hover:bg-white/5 hover:text-white/60',
        isBusy && 'cursor-not-allowed opacity-50'
      )}
      title="Settings"
    >
      <Settings className="h-4 w-4" />
    </button>
  )

  // Show FFmpeg warning if not available
  if (ffmpegAvailable === false) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <Breadcrumb right={settingsButton} />
        <QuickClipFfmpegWarning />
      </div>
    )
  }

  // Loading state while checking FFmpeg or settings
  if (ffmpegAvailable === null || isLoadingRecordings || isLoadingSettings) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <Breadcrumb />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Breadcrumb right={settingsButton} />
      <QuickClipRecordingsView
        recordings={recordings}
        isRecording={isRecording}
        isPreparing={isPreparing}
        isEncoding={isEncoding}
        elapsedSeconds={recordingStatus?.elapsedSeconds ?? 0}
        onToggleRecording={handleToggleRecording}
        onDeleteRecording={deleteRecording}
      />
    </div>
  )
}

function QuickClipFfmpegWarning() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
      </div>

      <div className="space-y-2">
        <h3 className="text-[14px] font-semibold text-white/90">
          FFmpeg Required
        </h3>
        <p className="max-w-[240px] text-[12px] leading-relaxed text-white/50">
          QuickClip needs FFmpeg to encode videos. Install it with your package manager:
        </p>
      </div>

      <div className="w-full max-w-[260px] rounded-lg bg-white/[0.03] p-3">
        <code className="block text-[11px] font-mono text-white/70">
          sudo pacman -S ffmpeg
        </code>
        <span className="mt-1 block text-[10px] text-white/30">
          Arch Linux / Manjaro
        </span>
      </div>

      <p className="text-[11px] text-white/30">
        Restart Jubby after installing
      </p>
    </div>
  )
}

interface QuickClipRecordingsViewProps {
  recordings: Recording[]
  isRecording: boolean
  isPreparing: boolean
  isEncoding: boolean
  elapsedSeconds: number
  onToggleRecording: () => void
  onDeleteRecording: (id: string) => Promise<void>
}

function QuickClipRecordingsView({
  recordings,
  isRecording,
  isPreparing,
  isEncoding,
  elapsedSeconds,
  onToggleRecording,
  onDeleteRecording,
}: QuickClipRecordingsViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <QuickClipRecordingsHeader
        recordingCount={recordings.length}
        isRecording={isRecording}
        isPreparing={isPreparing}
        isEncoding={isEncoding}
        elapsedSeconds={elapsedSeconds}
        onToggleRecording={onToggleRecording}
      />
      <QuickClipRecordingsGrid
        recordings={recordings}
        onDeleteRecording={onDeleteRecording}
      />
    </div>
  )
}

interface QuickClipRecordingsHeaderProps {
  recordingCount: number
  isRecording: boolean
  isPreparing: boolean
  isEncoding: boolean
  elapsedSeconds: number
  onToggleRecording: () => void
}

function QuickClipRecordingsHeader({
  recordingCount,
  isRecording,
  isPreparing,
  isEncoding,
  elapsedSeconds,
  onToggleRecording,
}: QuickClipRecordingsHeaderProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const isDisabled = isPreparing || isEncoding

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-white/40" />
        <span className="text-[12px] font-medium text-white/60">
          {recordingCount} clip{recordingCount !== 1 ? 's' : ''}
        </span>
      </div>

      <motion.button
        onClick={onToggleRecording}
        disabled={isDisabled}
        whileHover={{ scale: isDisabled ? 1 : 1.02 }}
        whileTap={{ scale: isDisabled ? 1 : 0.98 }}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-1.5',
          'text-[12px] font-medium transition-all duration-150',
          'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
          isRecording
            ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white/90',
          isDisabled && 'cursor-not-allowed opacity-50'
        )}
      >
        {isPreparing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Starting...</span>
          </>
        ) : isEncoding ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Encoding...</span>
          </>
        ) : isRecording ? (
          <>
            <motion.span
              className="h-2 w-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <span className="font-mono tabular-nums">{formatTime(elapsedSeconds)}</span>
            <Square className="h-3 w-3 fill-current" />
          </>
        ) : (
          <>
            <Circle className="h-3 w-3 fill-red-500 text-red-500" />
            <span>Record</span>
          </>
        )}
      </motion.button>
    </div>
  )
}

interface QuickClipRecordingsGridProps {
  recordings: Recording[]
  onDeleteRecording: (id: string) => Promise<void>
}

function QuickClipRecordingsGrid({ recordings, onDeleteRecording }: QuickClipRecordingsGridProps) {
  if (recordings.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <Film className="mb-3 h-8 w-8 text-white/20" />
        <p className="text-[13px] text-white/40">No clips yet</p>
        <p className="mt-1 text-[11px] text-white/25">
          Hit record to capture your first clip
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2">
        <AnimatePresence mode="popLayout">
          {recordings.map((recording, index) => (
            <motion.div
              key={recording.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                layout: { duration: 0.2 },
                opacity: { duration: 0.15, delay: index * 0.03 },
                scale: { duration: 0.15, delay: index * 0.03 },
              }}
            >
              <QuickClipRecordingCard
                recording={recording}
                onDelete={() => onDeleteRecording(recording.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

interface QuickClipRecordingCardProps {
  recording: Recording
  onDelete: () => void
}

function QuickClipRecordingCard({ recording, onDelete }: QuickClipRecordingCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined)
  const [videoError, setVideoError] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)

  const thumbnailSrc = convertFileSrc(recording.thumbnailPath)

  // Log asset paths for debugging
  useEffect(() => {
    log.debug('Recording card mounted', {
      id: recording.id,
      thumbnailPath: recording.thumbnailPath,
      thumbnailSrc,
    })
  }, [recording.id, recording.thumbnailPath, thumbnailSrc])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `0:${secs.toString().padStart(2, '0')}`
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const handleMouseEnter = () => {
    setIsHovering(true)
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    setShowActions(false)
    setPendingDelete(false)
  }

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    const error = video.error
    const errorMsg = error ? `${error.code}: ${error.message}` : 'unknown'
    log.error('Video playback failed', {
      id: recording.id,
      error: errorMsg,
      videoSrc,
    })
    setVideoError(true)
    setIsPlaying(false)
    setVideoSrc(undefined)
  }

  // Clean up blob URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (videoSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(videoSrc)
      }
    }
  }, [videoSrc])

  // Force video to load when src is set (required because preload="none")
  useEffect(() => {
    if (videoSrc && videoRef.current) {
      videoRef.current.load()
    }
  }, [videoSrc])

  // Click to play - safer than auto-play on hover
  const handlePlayClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoError || isLoading) return

    if (!videoSrc) {
      try {
        setIsLoading(true)
        log.debug('Loading video via blob', { id: recording.id, path: recording.videoPath })
        // Read video bytes from Tauri backend
        const bytes = await invoke<number[]>('read_video_file', { path: recording.videoPath })
        const blob = new Blob([new Uint8Array(bytes)], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)
        setVideoSrc(url)
        // Don't set isPlaying here - wait for canplay event
      } catch (err) {
        log.error('Failed to load video', { id: recording.id, error: String(err) })
        setIsLoading(false)
        setVideoError(true)
      }
    } else if (videoRef.current) {
      // Toggle play/pause (video already loaded)
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => {
          setIsPlaying(true)
        }).catch((err) => {
          log.error('Video play failed', { id: recording.id, error: String(err) })
          setVideoError(true)
          setIsPlaying(false)
        })
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }

  // Play video when it's loaded and ready
  const handleVideoCanPlay = () => {
    setIsLoading(false)
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true)
      }).catch((err) => {
        log.error('Video play failed on canplay', { id: recording.id, error: String(err) })
        setVideoError(true)
        setIsPlaying(false)
      })
    }
  }

  // Reset to thumbnail when video ends
  const handleVideoEnded = () => {
    setIsPlaying(false)
    // Keep videoSrc so replay doesn't need to reload
  }

  const handleCopyFile = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await invoke('copy_file_to_clipboard', { path: recording.videoPath })
      setIsCopied(true)
      toast.success('Video copied to clipboard')
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      log.error('Failed to copy video to clipboard', { error: String(error) })
      toast.error('Failed to copy video')
    }
  }

  const handleRevealFile = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await invoke('reveal_in_folder', { path: recording.videoPath })
    } catch (error) {
      log.error('Failed to reveal file', { path: recording.videoPath, error: String(error) })
      toast.error('Failed to reveal file')
    }
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (pendingDelete) {
      onDelete()
      setPendingDelete(false)
    } else {
      setPendingDelete(true)
    }
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg',
        'border border-white/[0.06] bg-white/[0.02]',
        'transition-all duration-200',
        'hover:border-white/[0.12] hover:bg-white/[0.04]',
        'hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative aspect-video overflow-hidden bg-black/40">
        {thumbnailError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-950/50 p-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-[9px] text-red-300 text-center break-all">
              Failed to load thumbnail
            </span>
          </div>
        ) : (
          <img
            src={thumbnailSrc}
            alt=""
            className={cn(
              'absolute inset-0 h-full w-full object-cover',
              'transition-opacity duration-200',
              isPlaying ? 'opacity-0' : 'opacity-100'
            )}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement
              log.error('Thumbnail load failed', { id: recording.id, src: img.src })
              setThumbnailError(true)
            }}
            onLoad={() => {
              log.debug('Thumbnail loaded', { id: recording.id })
            }}
          />
        )}

        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            playsInline
            preload="none"
            onError={handleVideoError}
            onCanPlay={handleVideoCanPlay}
            onEnded={handleVideoEnded}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent',
            'transition-opacity duration-200',
            isHovering ? 'opacity-100' : 'opacity-60'
          )}
        />

        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/90 backdrop-blur-sm">
            {formatDuration(recording.duration)}
          </span>
        </div>

        <AnimatePresence>
          {isHovering && !showActions && !videoError && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={handlePlayClick}
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-white/80 drop-shadow-lg" />
              ) : isPlaying ? (
                <Pause className="h-8 w-8 text-white/80 drop-shadow-lg" />
              ) : (
                <Play className="h-8 w-8 text-white/80 drop-shadow-lg" />
              )}
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isHovering && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute right-1.5 top-1.5 flex items-center gap-1"
            >
              <button
                onClick={handleCopyFile}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded',
                  'bg-black/60 backdrop-blur-sm',
                  'text-white/70 transition-all duration-150',
                  'hover:bg-black/80 hover:text-white',
                  isCopied && 'bg-green-500/60 text-white'
                )}
                title="Copy video"
              >
                {isCopied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>

              <button
                onClick={handleRevealFile}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded',
                  'bg-black/60 backdrop-blur-sm',
                  'text-white/70 transition-all duration-150',
                  'hover:bg-black/80 hover:text-white'
                )}
                title="Reveal in file manager"
              >
                <FolderOpen className="h-3 w-3" />
              </button>

              <button
                onClick={handleDeleteClick}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded',
                  'backdrop-blur-sm transition-all duration-150',
                  pendingDelete
                    ? 'bg-red-500/80 text-white hover:bg-red-500'
                    : 'bg-black/60 text-white/70 hover:bg-red-500/60 hover:text-white'
                )}
                title={pendingDelete ? 'Click again to delete' : 'Delete recording'}
              >
                {pendingDelete ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-white/50">
            {formatTimestamp(recording.timestamp)}
          </span>
          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/40">
            FHD
          </span>
        </div>
      </div>
    </div>
  )
}

export { QuickClipPlugin }
