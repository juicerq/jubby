import { useEffect } from 'react'
import { Breadcrumb } from '@/core/components/Breadcrumb'
import { useNavigation } from '@/core/context/NavigationContext'
import { ShortcutCapture } from './ShortcutCapture'
import { useSettings } from '@/core/hooks/useSettings'

function Settings() {
  const { pushLevel, resetToRoot } = useNavigation()

  useEffect(() => {
    pushLevel({ id: 'settings', label: 'Settings' })
    return () => resetToRoot()
  }, [pushLevel, resetToRoot])
  const { settings, isLoading, updateShortcut } = useSettings()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Breadcrumb />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <SettingsSection title="Global Shortcut">
          <SettingsRow
            label="Activation key"
            description="Shortcut to show/hide the window"
          >
            <ShortcutCapture
              value={settings.globalShortcut}
              onChange={updateShortcut}
            />
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
      <div className="flex flex-col gap-2">
        {children}
      </div>
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
        {description && (
          <span className="text-[12px] text-white/40">{description}</span>
        )}
      </div>
      {children}
    </div>
  )
}

export { Settings }
