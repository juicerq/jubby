import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_HISTORY = 50
const DEBOUNCE_MS = 300

interface UseTextHistoryReturn {
  text: string
  setText: (value: string) => void
  handleKeyDown: (e: React.KeyboardEvent) => boolean // returns true if handled
  pushState: (value: string) => void // força push imediato (ex: após enhance)
}

export function useTextHistory(initialValue = ''): UseTextHistoryReturn {
  const [text, setTextInternal] = useState(initialValue)
  const historyRef = useRef<string[]>([initialValue])
  const indexRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToHistory = useCallback((value: string) => {
    const history = historyRef.current
    const currentIndex = indexRef.current

    // Se valor igual ao atual, ignora
    if (history[currentIndex] === value) return

    // Remove estados "redo" se usuário digitou algo novo
    const newHistory = history.slice(0, currentIndex + 1)
    newHistory.push(value)

    // Limita tamanho
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    } else {
      indexRef.current = newHistory.length - 1
    }

    historyRef.current = newHistory
  }, [])

  const setText = useCallback((value: string) => {
    setTextInternal(value)

    // Debounce para não salvar cada keystroke
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      pushToHistory(value)
    }, DEBOUNCE_MS)
  }, [pushToHistory])

  const pushState = useCallback((value: string) => {
    // Push imediato, sem debounce (para após enhance)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setTextInternal(value)
    pushToHistory(value)
  }, [pushToHistory])

  const undo = useCallback(() => {
    // Salva estado atual antes de undo se houver debounce pendente
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      pushToHistory(text)
    }

    if (indexRef.current > 0) {
      indexRef.current--
      const previousValue = historyRef.current[indexRef.current]
      setTextInternal(previousValue)
    }
  }, [text, pushToHistory])

  const redo = useCallback(() => {
    const history = historyRef.current
    if (indexRef.current < history.length - 1) {
      indexRef.current++
      const nextValue = history[indexRef.current]
      setTextInternal(nextValue)
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault()
      undo()
      return true
    }
    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault()
      redo()
      return true
    }
    return false
  }, [undo, redo])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return { text, setText, handleKeyDown, pushState }
}
