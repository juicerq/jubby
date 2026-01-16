import { useEffect, useState, useCallback, useRef, useMemo, type RefObject } from 'react'
import { Search, Settings } from 'lucide-react'
import type { PluginManifest } from '@/core/types'

interface PluginGridProps {
  plugins: PluginManifest[]
  onPluginClick?: (plugin: PluginManifest) => void
  onSettingsClick?: () => void
}

const COLUMNS = 4

export function PluginGrid({ plugins, onPluginClick, onSettingsClick }: PluginGridProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return plugins
    const query = searchQuery.toLowerCase()
    return plugins.filter(plugin =>
      plugin.name.toLowerCase().includes(query) ||
      plugin.id.toLowerCase().includes(query)
    )
  }, [plugins, searchQuery])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredPlugins.length])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (document.activeElement === searchInputRef.current) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault()
          searchInputRef.current?.blur()
        }
        return
      }

      if (filteredPlugins.length === 0) return

      const total = filteredPlugins.length
      let newIndex = selectedIndex

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          newIndex = (selectedIndex + 1) % total
          break
        case 'ArrowLeft':
          e.preventDefault()
          newIndex = (selectedIndex - 1 + total) % total
          break
        case 'ArrowDown':
          e.preventDefault()
          newIndex = Math.min(selectedIndex + COLUMNS, total - 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (selectedIndex < COLUMNS) {
            searchInputRef.current?.focus()
          } else {
            newIndex = selectedIndex - COLUMNS
          }
          break
        case 'Enter':
          e.preventDefault()
          onPluginClick?.(filteredPlugins[selectedIndex])
          return
        default:
          return
      }

      setSelectedIndex(newIndex)
    },
    [selectedIndex, filteredPlugins, onPluginClick]
  )

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
        selectedIndex={selectedIndex}
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
        className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-colors duration-150"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  )
}

interface PluginGridContentProps {
  filteredPlugins: PluginManifest[]
  selectedIndex: number
  onPluginClick?: (plugin: PluginManifest) => void
}

function PluginGridContent({ filteredPlugins, selectedIndex, onPluginClick }: PluginGridContentProps) {
  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-white/40">Plugins</span>

      {filteredPlugins.length === 0 ? (
        <PluginGridEmptyState />
      ) : (
        <div className="grid grid-cols-[repeat(4,80px)] gap-2">
          {filteredPlugins.map((plugin, index) => (
            <PluginGridCard
              key={plugin.id}
              plugin={plugin}
              isSelected={index === selectedIndex}
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
  isSelected: boolean
  onClick: () => void
}

function PluginGridCard({ plugin, isSelected, onClick }: PluginGridCardProps) {
  const Icon = plugin.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group relative
        flex flex-col items-center justify-center
        w-20 h-20
        rounded-lg
        bg-transparent
        border border-transparent
        cursor-pointer
        transition-all duration-150 ease-out
        active:scale-95
        focus:outline-none
        before:content-[''] before:absolute before:inset-0 before:rounded-lg before:bg-transparent before:transition-all before:duration-150
        hover:before:bg-white/8
        ${isSelected ? 'before:bg-white/8 before:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_0_0_1px_rgba(255,255,255,0.06)] hover:before:bg-white/10' : ''}
      `}
    >
      <Icon className="relative z-10 w-8 h-8 text-white/80 mb-1.5" />
      <span className="relative z-10 text-[10px] font-medium text-white/60 truncate max-w-[72px] text-center leading-tight transition-colors duration-150 group-hover:text-white/80">
        {plugin.name}
      </span>
    </button>
  )
}
