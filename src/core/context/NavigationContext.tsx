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
  onClick?: () => void
}

interface NavigationContextValue {
  levels: NavigationLevel[]
  pushLevel: (level: NavigationLevel) => void
  popLevel: () => void
  resetToRoot: () => void
  replaceLevel: (level: NavigationLevel) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

interface NavigationProviderProps {
  children: ReactNode
  rootLevel: NavigationLevel
}

function NavigationProvider({ children, rootLevel }: NavigationProviderProps) {
  const [levels, setLevels] = useState<NavigationLevel[]>([rootLevel])

  const pushLevel = useCallback((level: NavigationLevel) => {
    setLevels((prev) => [...prev, level])
  }, [])

  const popLevel = useCallback(() => {
    setLevels((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }, [])

  const resetToRoot = useCallback(() => {
    setLevels([rootLevel])
  }, [rootLevel])

  const replaceLevel = useCallback((level: NavigationLevel) => {
    setLevels((prev) => [...prev.slice(0, -1), level])
  }, [])

  return (
    <NavigationContext.Provider
      value={{ levels, pushLevel, popLevel, resetToRoot, replaceLevel }}
    >
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
