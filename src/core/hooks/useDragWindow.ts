import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function useDragWindow() {
  useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const isInteractive = target.closest(
        'button, a, input, textarea, select, [role="button"], [data-no-drag]'
      )

      if (!isInteractive && e.button === 0) {
        await getCurrentWindow().startDragging()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])
}
