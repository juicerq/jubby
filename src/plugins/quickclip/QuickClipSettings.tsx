import { Breadcrumb } from '@/core/components/Breadcrumb'
import { useNavigationLevels } from '@/core/hooks'
import { cn } from '@/lib/utils'
import type { ResolutionScale, AudioMode, Framerate } from './types'

interface QuickClipSettingsProps {
  resolution: ResolutionScale
  onResolutionChange: (resolution: ResolutionScale) => void
  framerate: Framerate
  onFramerateChange: (framerate: Framerate) => void
  audioMode: AudioMode
  onAudioModeChange: (mode: AudioMode) => void
  onNavigateBack: () => void
}

function QuickClipSettings({
  resolution,
  onResolutionChange,
  framerate,
  onFramerateChange,
  audioMode,
  onAudioModeChange,
  onNavigateBack,
}: QuickClipSettingsProps) {
  useNavigationLevels([
    { id: 'quickclip', label: 'QuickClip', onNavigate: onNavigateBack },
    { id: 'quickclip-settings', label: 'Settings' },
  ])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Breadcrumb />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <SettingsSection title="Encoding">
          <SettingsRow label="Resolution" description="Output video dimensions">
            <SegmentedToggle
              value={resolution}
              onChange={onResolutionChange}
              options={[
                { value: '1080p' as const, label: '1080p' },
                { value: '720p' as const, label: '720p' },
                { value: '480p' as const, label: '480p' },
                { value: 'native' as const, label: 'Native' },
              ]}
            />
          </SettingsRow>
          <SettingsRow label="Frame Rate" description="Frames per second">
            <SegmentedToggle
              value={framerate}
              onChange={onFramerateChange}
              options={[
                { value: '30' as const, label: '30' },
                { value: '60' as const, label: '60' },
                { value: '120' as const, label: '120' },
              ]}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Audio">
          <SettingsRow label="Source" description="Sound sources to include">
            <SegmentedToggle
              value={audioMode}
              onChange={onAudioModeChange}
              options={[
                { value: 'none' as const, label: 'None' },
                { value: 'system' as const, label: 'System' },
                { value: 'mic' as const, label: 'Mic' },
                { value: 'both' as const, label: 'Both' },
              ]}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Shortcuts">
          <div className="opacity-40">
            <SettingsRow label="Record" description="Start and stop recording">
              <span className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/50">
                Coming soon
              </span>
            </SettingsRow>
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[12px] font-medium uppercase tracking-wide text-white/40">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

interface SettingsRowProps {
  label: string
  description?: string
  children: React.ReactNode
}

function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-white/90">{label}</span>
        {description && <span className="text-[12px] text-white/40">{description}</span>}
      </div>
      {children}
    </div>
  )
}

interface SegmentedToggleProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
}

function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: SegmentedToggleProps<T>) {
  return (
    <div className="inline-flex rounded-lg border border-white/[0.06] bg-white/[0.04] p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-150',
            value === opt.value
              ? 'bg-white/10 text-white/90'
              : 'text-white/50 hover:text-white/70'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export { QuickClipSettings }
