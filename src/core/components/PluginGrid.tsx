import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { PluginManifest } from '@/core/types'
import { plugins } from '@/plugins/registry'

interface PluginGridProps {
  onPluginClick?: (plugin: PluginManifest) => void
}

const COLUMNS = 3

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
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">Nenhum plugin disponível</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      {plugins.map((plugin, index) => (
        <Card
          key={plugin.id}
          className={`cursor-pointer transition-all duration-150 ease-out hover:bg-accent active:scale-95 ${
            index === selectedIndex
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              : ''
          }`}
          onClick={() => onPluginClick?.(plugin)}
        >
          <CardContent className="flex flex-col items-center justify-center gap-2 p-4">
            <span className="text-3xl transition-transform duration-150 ease-out group-hover:scale-110">{plugin.icon}</span>
            <span className="text-center text-sm font-medium">{plugin.name}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
