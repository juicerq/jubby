import { useEffect, useState, useCallback } from 'react'
import type { PluginManifest } from '@/core/types'
import { plugins } from '@/plugins/registry'

interface PluginGridProps {
  onPluginClick?: (plugin: PluginManifest) => void
}

const COLUMNS = 4

export function PluginGrid({ onPluginClick }: PluginGridProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (plugins.length === 0) return

      const total = plugins.length
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
          newIndex = (selectedIndex + COLUMNS) % total
          break
        case 'ArrowUp':
          e.preventDefault()
          newIndex = (selectedIndex - COLUMNS + total) % total
          break
        case 'Enter':
          e.preventDefault()
          onPluginClick?.(plugins[selectedIndex])
          return
        default:
          return
      }

      setSelectedIndex(newIndex)
    },
    [selectedIndex, onPluginClick]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (plugins.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Nenhum plugin disponível
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="grid grid-cols-4 gap-3">
        {plugins.map((plugin, index) => {
          const isSelected = index === selectedIndex
          return (
            <button
              key={plugin.id}
              type="button"
              onClick={() => onPluginClick?.(plugin)}
              className={`
                plugin-card group
                flex flex-col items-center justify-center
                w-20 h-20
                rounded-lg
                bg-transparent
                border border-transparent
                cursor-pointer
                transition-all duration-150 ease-out
                active:scale-95
                focus:outline-none
                ${isSelected ? 'plugin-card--selected' : ''}
              `}
            >
              <span className="text-[32px] leading-none mb-1.5 transition-transform duration-150 ease-out group-hover:-translate-y-0.5">
                {plugin.icon}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[72px] text-center leading-tight transition-colors duration-150 group-hover:text-foreground/80">
                {plugin.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
