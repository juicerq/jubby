import { useState, useEffect, useRef, type ReactNode } from 'react'

interface ViewTransitionProps {
  children: ReactNode
  /** Unique key to trigger transition when view changes */
  viewKey: string
}

/**
 * ViewTransition wraps content and applies smooth fade + translateY
 * animations when the viewKey changes.
 *
 * Animation: 180ms fade-in with subtle upward movement
 */
export function ViewTransition({ children, viewKey }: ViewTransitionProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [currentContent, setCurrentContent] = useState<ReactNode>(children)
  const [currentKey, setCurrentKey] = useState(viewKey)
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (viewKey !== currentKey) {
      // Start exit animation
      setIsVisible(false)

      // After exit animation completes, swap content and enter
      const exitTimer = setTimeout(() => {
        setCurrentContent(children)
        setCurrentKey(viewKey)
        // Small delay to ensure DOM update before enter animation
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      }, 100) // Exit duration (shorter for snappy feel)

      return () => clearTimeout(exitTimer)
    } else {
      // Same view, just update content
      setCurrentContent(children)
    }
  }, [viewKey, children, currentKey])

  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden transition-[opacity,transform] duration-[180ms] ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-1.5 scale-[0.98]'
      }`}
    >
      {currentContent}
    </div>
  )
}
