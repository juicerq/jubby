import { Breadcrumb } from '@/core/components/Breadcrumb'
import { ShortcutCapture } from '@/core/components/Settings/ShortcutCapture'
import { Checkbox } from '@/components/ui/checkbox'
import { useNavigationLevels } from '@/core/hooks'
import { cn } from '@/lib/utils'
import type { CaptureMode, QualityMode, ResolutionScale } from './types'

interface QuickClipSettingsProps {
  captureMode: CaptureMode | 'area'
  onCaptureModeChange: (mode: CaptureMode | 'area') => void
  systemAudio: boolean
  onSystemAudioChange: (enabled: boolean) => void
  microphone: boolean
  onMicrophoneChange: (enabled: boolean) => void
  qualityMode: QualityMode
  onQualityModeChange: (mode: QualityMode) => void
  resolution: ResolutionScale
  onResolutionChange: (resolution: ResolutionScale) => void
  hotkey: string
  onHotkeyChange: (hotkey: string) => void
  onNavigateBack: () => void
}

function QuickClipSettings({
  captureMode,
  onCaptureModeChange,
  systemAudio,
  onSystemAudioChange,
  microphone,
  onMicrophoneChange,
  qualityMode,
  onQualityModeChange,
  resolution,
  onResolutionChange,
  hotkey,
  onHotkeyChange,
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
        <SettingsSection title="Capture">
          <SettingsRow label="Screen" description="Recording region">
            <SegmentedToggle
              value={captureMode}
              onChange={onCaptureModeChange}
              options={[
                { value: 'fullscreen' as const, label: 'Fullscreen' },
                { value: 'area' as const, label: 'Area' },
              ]}
            />
          </SettingsRow>
          <SettingsRow label="Audio" description="Sound sources to include">
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                <Checkbox
                  checked={systemAudio}
                  onCheckedChange={(checked) => onSystemAudioChange(checked === true)}
                  className="border-white/20 data-[state=checked]:border-white/40 data-[state=checked]:bg-white/10"
                />
                <span className="text-white/70">System audio</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                <Checkbox
                  checked={microphone}
                  onCheckedChange={(checked) => onMicrophoneChange(checked === true)}
                  className="border-white/20 data-[state=checked]:border-white/40 data-[state=checked]:bg-white/10"
                />
                <span className="text-white/70">Microphone</span>
              </label>
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Encoding">
          <SettingsRow label="Quality" description="Balance between size and clarity">
            <SegmentedToggle
              value={qualityMode}
              onChange={onQualityModeChange}
              options={[
                { value: 'light' as const, label: 'Light' },
                { value: 'high' as const, label: 'High' },
              ]}
            />
          </SettingsRow>
          <SettingsRow label="Resolution" description="Output video dimensions">
            <SegmentedToggle
              value={resolution}
              onChange={onResolutionChange}
              options={[
                { value: 'native' as const, label: 'Native' },
                { value: 'p720' as const, label: '720p' },
                { value: 'p480' as const, label: '480p' },
              ]}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Shortcuts">
          <SettingsRow label="Record" description="Start and stop recording">
            <ShortcutCapture value={hotkey} onChange={onHotkeyChange} />
          </SettingsRow>
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
