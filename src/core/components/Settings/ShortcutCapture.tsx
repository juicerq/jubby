import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface ShortcutCaptureProps {
  value: string
  onChange: (shortcut: string) => void
  disabled?: boolean
}

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
])

const BLOCKED_KEYS = new Set(['Escape'])

function codeToKeyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`
  if (code.startsWith('Arrow')) return code.slice(5)

  const mappings: Record<string, string> = {
    Space: 'Space',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Enter: 'Enter',
    CapsLock: 'CapsLock',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  }

  if (mappings[code]) return mappings[code]
  if (code.startsWith('F') && /^F\d+$/.test(code)) return code

  return code
}

function buildShortcutString(event: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(event.code)) return null
  if (BLOCKED_KEYS.has(event.code)) return null

  const parts: string[] = []

  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Super')

  const keyName = codeToKeyName(event.code)
  parts.push(keyName)

  return parts.join('+')
}

function ShortcutCapture({ value, onChange, disabled = false }: ShortcutCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const shortcut = buildShortcutString(event)
      if (shortcut) {
        onChange(shortcut)
        setIsCapturing(false)
      }
    },
    [onChange]
  )

  useEffect(() => {
    if (!isCapturing) return

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isCapturing, handleKeyDown])

  useEffect(() => {
    if (!isCapturing) return

    const handleBlur = () => setIsCapturing(false)
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [isCapturing])

  const handleClick = () => {
    if (!disabled) {
      setIsCapturing(true)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'h-10 min-w-[140px] rounded-[10px] px-4 text-[13px] font-medium tracking-[-0.01em]',
        'transition-all duration-[180ms] ease-out',
        'outline-none',
        isCapturing
          ? 'border border-white/20 bg-white/8 text-white/60 shadow-[0_0_0_3px_rgba(255,255,255,0.06)]'
          : 'border border-transparent bg-white/4 text-white/90 hover:bg-white/6',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      {isCapturing ? 'Press shortcut...' : value}
    </button>
  )
}

export { ShortcutCapture }
