import { useEffect, useCallback, useRef, useMemo, useState, type RefObject } from 'react'
import { Search, Settings } from 'lucide-react'
import type { PluginManifest } from '@/core/types'

interface PluginGridProps {
  plugins: PluginManifest[]
  onPluginClick?: (plugin: PluginManifest) => void
  onSettingsClick?: () => void
}

export function PluginGrid({ plugins, onPluginClick, onSettingsClick }: PluginGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return plugins
    const query = searchQuery.toLowerCase()
    return plugins.filter(plugin =>
      plugin.name.toLowerCase().includes(query) ||
      plugin.id.toLowerCase().includes(query) ||
      plugin.description.toLowerCase().includes(query)
    )
  }, [plugins, searchQuery])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      searchInputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <PluginGridSearch
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchInputRef={searchInputRef}
        onSettingsClick={onSettingsClick}
      />
      <PluginGridContent
        filteredPlugins={filteredPlugins}
        onPluginClick={onPluginClick}
      />
    </div>
  )
}

// Mini-componentes

interface PluginGridSearchProps {
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  onSettingsClick?: () => void
}

function PluginGridSearch({ searchQuery, setSearchQuery, searchInputRef, onSettingsClick }: PluginGridSearchProps) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="relative flex-1">
        <input
          ref={searchInputRef}
          type="text"
          className="w-full h-9 pl-9 pr-10 text-[13px] font-normal tracking-tight text-white/95 bg-white/[0.04] border border-transparent rounded-[10px] outline-none transition-all duration-200 placeholder:text-white/35 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:border-white/15 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          placeholder="Search plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 pointer-events-none" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium tracking-wide text-white/25 bg-white/[0.06] px-1.5 py-0.5 rounded pointer-events-none opacity-70">⌘K</span>
      </div>
      <button
        type="button"
        onClick={onSettingsClick}
        className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-colors duration-150 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  )
}

interface PluginGridContentProps {
  filteredPlugins: PluginManifest[]
  onPluginClick?: (plugin: PluginManifest) => void
}

function PluginGridContent({ filteredPlugins, onPluginClick }: PluginGridContentProps) {
  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-white/40">Plugins</span>

      {filteredPlugins.length === 0 ? (
        <PluginGridEmptyState />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {filteredPlugins.map((plugin) => (
            <PluginGridCard
              key={plugin.id}
              plugin={plugin}
              onClick={() => onPluginClick?.(plugin)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PluginGridEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-2 text-white/35">
      <p className="text-[13px] font-normal tracking-tight">No plugins found</p>
    </div>
  )
}

interface PluginGridCardProps {
  plugin: PluginManifest
  onClick: () => void
}

function PluginGridCard({ plugin, onClick }: PluginGridCardProps) {
  const Icon = plugin.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex items-center gap-3 p-3 rounded-lg bg-transparent border border-white/10 cursor-pointer transition-all duration-150 ease-out active:scale-[0.98] focus:outline-none before:content-[''] before:absolute before:inset-0 before:rounded-lg before:transition-all before:duration-150 hover:before:bg-white/5 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
    >
      <Icon className="relative z-10 w-[22px] h-[22px] text-white/80 shrink-0" />
      <div className="relative z-10 flex flex-col min-w-0 overflow-hidden">
        <span className="text-[12px] font-medium text-white/80 truncate text-left">
          {plugin.name}
        </span>
        <span className="text-[10px] text-white/40 truncate text-left">
          {plugin.description}
        </span>
      </div>
    </button>
  )
}
