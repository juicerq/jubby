import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

interface UseEnhancerReturn {
  enhance: (text: string) => Promise<void>
  result: string | null
  isLoading: boolean
  error: string | null
  reset: () => void
}

export function useEnhancer(): UseEnhancerReturn {
  const [result, setResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enhance = useCallback(async (text: string) => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const enhanced = await invoke<string>('enhance_prompt', { text })
      setResult(enhanced)

      // Clipboard is best-effort, don't fail enhancement
      try {
        await navigator.clipboard.writeText(enhanced)
        toast.success('Copiado!')
      } catch {
        // Silently fail if clipboard is unavailable
      }
    } catch (err) {
      const errorMessage = String(err)
      setError(errorMessage)
      toast.error('Falha ao melhorar prompt')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setIsLoading(false)
    setError(null)
  }, [])

  return {
    enhance,
    result,
    isLoading,
    error,
    reset,
  }
}
