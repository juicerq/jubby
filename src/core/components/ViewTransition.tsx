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
  const [displayedChildren, setDisplayedChildren] = useState<ReactNode>(children)
  const [displayedKey, setDisplayedKey] = useState(viewKey)
  const isTransitioning = useRef(false)

  useEffect(() => {
    // Se a key não mudou, apenas atualizar children sem animação
    if (viewKey === displayedKey) {
      setDisplayedChildren(children)
      return
    }

    // Evitar transições sobrepostas
    if (isTransitioning.current) return
    isTransitioning.current = true

    // Iniciar exit animation
    setIsVisible(false)

    const timer = setTimeout(() => {
      // Trocar conteúdo
      setDisplayedChildren(children)
      setDisplayedKey(viewKey)

      // Iniciar enter animation
      requestAnimationFrame(() => {
        setIsVisible(true)
        isTransitioning.current = false
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      isTransitioning.current = false
    }
  }, [viewKey]) // APENAS viewKey como dependência

  // Atualizar children quando não está em transição e key é a mesma
  useEffect(() => {
    if (!isTransitioning.current && viewKey === displayedKey) {
      setDisplayedChildren(children)
    }
  }, [children, viewKey, displayedKey])

  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden transition-[opacity,transform] duration-[180ms] ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-1.5 scale-[0.98]'
      }`}
    >
      {displayedChildren}
    </div>
  )
}
