import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_HISTORY = 50
const DEBOUNCE_MS = 300

interface UseTextHistoryReturn {
  text: string
  setText: (value: string) => void
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  pushState: (value: string) => void
}

export function useTextHistory(initialValue = ''): UseTextHistoryReturn {
  const [text, setTextInternal] = useState(initialValue)
  const historyRef = useRef<string[]>([initialValue])
  const indexRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToHistory = useCallback((value: string) => {
    const history = historyRef.current
    const currentIndex = indexRef.current

    if (history[currentIndex] === value) return

    const newHistory = history.slice(0, currentIndex + 1)
    newHistory.push(value)

    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    } else {
      indexRef.current = newHistory.length - 1
    }

    historyRef.current = newHistory
  }, [])

  const setText = useCallback((value: string) => {
    setTextInternal(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      pushToHistory(value)
    }, DEBOUNCE_MS)
  }, [pushToHistory])

  const pushState = useCallback((value: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setTextInternal(value)
    pushToHistory(value)
  }, [pushToHistory])

  const undo = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      pushToHistory(text)
    }

    if (indexRef.current > 0) {
      indexRef.current--
      setTextInternal(historyRef.current[indexRef.current])
    }
  }, [text, pushToHistory])

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current++
      setTextInternal(historyRef.current[indexRef.current])
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault()
      undo()
      return true
    }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
      e.preventDefault()
      redo()
      return true
    }
    return false
  }, [undo, redo])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return { text, setText, handleKeyDown, pushState }
}
