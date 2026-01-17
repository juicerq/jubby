import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'

export interface NavigationLevel {
  id: string
  label: string
  onNavigate?: () => void
}

interface NavigationContextValue {
  levels: NavigationLevel[]
  setLevels: (levels: NavigationLevel[]) => void
  navigateToLevel: (levelId: string) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

interface NavigationProviderProps {
  children: ReactNode
  rootLevel: NavigationLevel
}

function NavigationProvider({ children, rootLevel }: NavigationProviderProps) {
  const [levels, setLevelsState] = useState<NavigationLevel[]>([rootLevel])

  const setLevels = useCallback(
    (newLevels: NavigationLevel[]) => {
      if (newLevels.length === 0) {
        setLevelsState([rootLevel])
      } else {
        setLevelsState([rootLevel, ...newLevels])
      }
    },
    [rootLevel]
  )

  const navigateToLevel = useCallback((levelId: string) => {
    setLevelsState((prev) => {
      const index = prev.findIndex((l) => l.id === levelId)
      if (index === -1) return prev

      const targetLevel = prev[index]
      targetLevel.onNavigate?.()

      return prev.slice(0, index + 1)
    })
  }, [])

  return (
    <NavigationContext.Provider value={{ levels, setLevels, navigateToLevel }}>
      {children}
    </NavigationContext.Provider>
  )
}

function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
}

export { NavigationProvider, useNavigation }
