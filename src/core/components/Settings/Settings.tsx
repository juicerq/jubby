import { Settings as SettingsIcon } from 'lucide-react'
import { PluginHeader } from '@/core/components/PluginHeader'
import { ShortcutCapture } from './ShortcutCapture'
import { useSettings } from '@/core/hooks/useSettings'

interface SettingsProps {
  onBack: () => void
}

function Settings({ onBack }: SettingsProps) {
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
      <PluginHeader
        title="Configurações"
        icon={SettingsIcon}
        onBack={onBack}
      />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <SettingsSection title="Atalho Global">
          <SettingsRow
            label="Tecla de ativação"
            description="Atalho para mostrar/ocultar a janela"
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
