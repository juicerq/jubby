import { useEffect, useRef } from 'react'
import { useNavigation, type NavigationLevel } from '@/core/context/NavigationContext'

/**
 * Declaratively set navigation levels based on plugin state.
 * Levels auto-update when the array changes.
 *
 * @example
 * useNavigationLevels([
 *   { id: 'todo', label: 'Todo', onNavigate: () => setFolder(null) },
 *   currentFolder && { id: `folder-${currentFolder.id}`, label: currentFolder.name }
 * ])
 */
function useNavigationLevels(
  levels: (NavigationLevel | null | undefined | false)[]
) {
  const { setLevels } = useNavigation()

  const filteredLevels = levels.filter(
    (l): l is NavigationLevel => Boolean(l)
  )

  const levelIds = filteredLevels.map((l) => l.id).join('/')
  const prevLevelIds = useRef(levelIds)

  useEffect(() => {
    if (levelIds !== prevLevelIds.current) {
      prevLevelIds.current = levelIds
    }

    setLevels(filteredLevels)
  }, [levelIds, setLevels])

  useEffect(() => {
    return () => setLevels([])
  }, [setLevels])
}

export { useNavigationLevels }
