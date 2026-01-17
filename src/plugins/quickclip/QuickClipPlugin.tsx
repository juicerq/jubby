import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Circle, Monitor, Square, AlertTriangle, Loader2 } from 'lucide-react'
import { Breadcrumb } from '@/core/components/Breadcrumb'
import { useNavigationLevels } from '@/core/hooks'
import type { PluginProps } from '@/core/types'
import { useQuickClip } from './useQuickClip'
import { DEFAULT_SETTINGS, type CaptureMode } from './types'
import { cn } from '@/lib/utils'

function QuickClipPlugin(_props: PluginProps) {
  useNavigationLevels([{ id: 'quickclip', label: 'QuickClip' }])

  const {
    isRecording,
    isPreparing,
    isEncoding,
    recordingStatus,
    monitors,
    ffmpegAvailable,
    startRecording,
    stopRecording,
  } = useQuickClip()

  const [selectedMode, setSelectedMode] = useState<CaptureMode>(DEFAULT_SETTINGS.captureMode)
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null)

  // Auto-select primary monitor
  useEffect(() => {
    if (monitors.length > 0 && !selectedMonitorId) {
      const primary = monitors.find((m) => m.isPrimary) ?? monitors[0]
      setSelectedMonitorId(primary.id)
    }
  }, [monitors, selectedMonitorId])

  const handleToggleRecording = async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording(selectedMonitorId ?? undefined, DEFAULT_SETTINGS.qualityMode)
    }
  }

  // Show FFmpeg warning if not available
  if (ffmpegAvailable === false) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <Breadcrumb />
        <QuickClipFfmpegWarning />
      </div>
    )
  }

  // Loading state while checking FFmpeg
  if (ffmpegAvailable === null) {
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
      <Breadcrumb />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-4">
        <QuickClipRecordButton
          isRecording={isRecording}
          isPreparing={isPreparing}
          isEncoding={isEncoding}
          elapsedSeconds={recordingStatus?.elapsedSeconds ?? 0}
          onToggle={handleToggleRecording}
        />

        <AnimatePresence mode="wait">
          {!isRecording && !isEncoding && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-4"
            >
              <QuickClipModeSelector
                selectedMode={selectedMode}
                onSelectMode={setSelectedMode}
              />

              {selectedMode === 'fullscreen' && monitors.length > 1 && (
                <QuickClipMonitorSelector
                  monitors={monitors}
                  selectedMonitorId={selectedMonitorId}
                  onSelectMonitor={setSelectedMonitorId}
                />
              )}

              <QuickClipHotkeyHint hotkey={DEFAULT_SETTINGS.hotkey} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isEncoding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-[13px] text-white/60"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Encoding video...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

interface QuickClipRecordButtonProps {
  isRecording: boolean
  isPreparing: boolean
  isEncoding: boolean
  elapsedSeconds: number
  onToggle: () => void
}

function QuickClipRecordButton({
  isRecording,
  isPreparing,
  isEncoding,
  elapsedSeconds,
  onToggle,
}: QuickClipRecordButtonProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const isDisabled = isPreparing || isEncoding

  return (
    <div className="relative">
      {/* Outer ring - animated pulse when recording */}
      <motion.div
        className={cn(
          'absolute inset-0 rounded-full',
          isRecording && 'bg-red-500/20'
        )}
        animate={isRecording ? {
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.2, 0.5],
        } : {}}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ margin: '-12px' }}
      />

      {/* Main button */}
      <motion.button
        onClick={onToggle}
        disabled={isDisabled}
        whileHover={{ scale: isDisabled ? 1 : 1.05 }}
        whileTap={{ scale: isDisabled ? 1 : 0.95 }}
        className={cn(
          'relative flex h-24 w-24 flex-col items-center justify-center rounded-full',
          'border-2 transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]',
          isRecording
            ? 'border-red-500 bg-red-500/10 hover:bg-red-500/20'
            : 'border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10',
          isDisabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <AnimatePresence mode="wait">
          {isPreparing ? (
            <motion.div
              key="preparing"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Loader2 className="h-8 w-8 animate-spin text-white/60" />
            </motion.div>
          ) : isRecording ? (
            <motion.div
              key="recording"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-1"
            >
              <Square className="h-6 w-6 fill-red-500 text-red-500" />
              <span className="font-mono text-[13px] font-semibold tabular-nums text-red-400">
                {formatTime(elapsedSeconds)}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-1"
            >
              <Circle className="h-8 w-8 fill-red-500 text-red-500" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">
                Record
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Recording indicator dot */}
      {isRecording && (
        <motion.div
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      )}
    </div>
  )
}

interface QuickClipModeSelectorProps {
  selectedMode: CaptureMode
  onSelectMode: (mode: CaptureMode) => void
}

function QuickClipModeSelector({ selectedMode, onSelectMode }: QuickClipModeSelectorProps) {
  const modes: Array<{ id: CaptureMode; label: string; icon: typeof Monitor }> = [
    { id: 'fullscreen', label: 'Fullscreen', icon: Monitor },
  ]

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
      {modes.map((mode) => {
        const Icon = mode.icon
        const isSelected = selectedMode === mode.id

        return (
          <button
            key={mode.id}
            onClick={() => onSelectMode(mode.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium',
              'transition-all duration-150',
              isSelected
                ? 'bg-white/10 text-white/90'
                : 'text-white/50 hover:text-white/70 hover:bg-white/5'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}

interface QuickClipMonitorSelectorProps {
  monitors: Array<{ id: string; name: string; isPrimary: boolean; width: number; height: number }>
  selectedMonitorId: string | null
  onSelectMonitor: (id: string) => void
}

function QuickClipMonitorSelector({
  monitors,
  selectedMonitorId,
  onSelectMonitor,
}: QuickClipMonitorSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-wrap justify-center gap-2"
    >
      {monitors.map((monitor) => {
        const isSelected = selectedMonitorId === monitor.id
        const label = monitor.isPrimary ? 'Primary' : monitor.name

        return (
          <button
            key={monitor.id}
            onClick={() => onSelectMonitor(monitor.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5',
              'text-[11px] font-medium transition-all duration-150',
              isSelected
                ? 'border-white/20 bg-white/10 text-white/90'
                : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/10 hover:text-white/70'
            )}
          >
            <Monitor className="h-3 w-3" />
            <span>{label}</span>
            <span className="text-white/30">{monitor.width}×{monitor.height}</span>
          </button>
        )
      })}
    </motion.div>
  )
}

interface QuickClipHotkeyHintProps {
  hotkey: string
}

function QuickClipHotkeyHint({ hotkey }: QuickClipHotkeyHintProps) {
  const parts = hotkey.split('+')

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-white/35">
      <span>or press</span>
      <div className="flex items-center gap-0.5">
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-0.5 text-white/20">+</span>}
            <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/50">
              {part}
            </kbd>
          </span>
        ))}
      </div>
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

export { QuickClipPlugin }
