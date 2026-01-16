import { useRef, useEffect, type KeyboardEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { useEnhancer } from './useEnhancer'
import { useTextHistory } from './useTextHistory'
import { WaveAnimation } from './WaveAnimation'
import { PluginHeader } from '@/core/components/PluginHeader'
import type { PluginProps } from '@/core/types'

function PromptEnhancerPlugin({ onExitPlugin }: PluginProps) {
  const { text, setText, handleKeyDown: historyKeyDown, pushState } = useTextHistory('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { enhance, result, isLoading, reset } = useEnhancer()

  useEffect(() => {
    if (result) {
      pushState(result)
      reset()
    }
  }, [result, reset, pushState])

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isLoading])

  const handleEnhance = () => {
    if (text.trim() && !isLoading) {
      enhance(text.trim())
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (historyKeyDown(e)) return

    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      handleEnhance()
    }

    if (e.ctrlKey && e.key === 'Backspace' && text.trim()) {
      e.preventDefault()
      pushState('')
      reset()
    }
  }

  const canEnhance = text.trim().length > 0 && !isLoading

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PluginHeader title="Prompt Enhancer" icon={Sparkles} onBack={onExitPlugin} />

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        {isLoading ? (
          <PromptEnhancerLoading />
        ) : (
          <PromptEnhancerInput
            ref={textareaRef}
            value={text}
            onChange={setText}
            onKeyDown={handleKeyDown}
            onEnhance={handleEnhance}
            canEnhance={canEnhance}
          />
        )}
      </div>
    </div>
  )
}

function PromptEnhancerLoading() {
  return (
    <div className="relative flex-1 overflow-hidden">
      <WaveAnimation className="absolute inset-0" />
    </div>
  )
}

interface PromptEnhancerInputProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onEnhance: () => void
  canEnhance: boolean
}

const PromptEnhancerInput = ({
  ref,
  value,
  onChange,
  onKeyDown,
  onEnhance,
  canEnhance,
}: PromptEnhancerInputProps & { ref: React.RefObject<HTMLTextAreaElement | null> }) => {
  return (
    <>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Paste or write your messy prompt here..."
        autoFocus
        className="flex-1 resize-none rounded-[10px] border border-transparent bg-white/4 px-3.5 py-3 text-[13px] font-normal leading-relaxed tracking-[-0.01em] text-white/95 outline-none transition-all duration-[180ms] ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
      />

      <div className="flex shrink-0 items-center justify-between">
        <PromptEnhancerHints />

        <button
          type="button"
          onClick={onEnhance}
          disabled={!canEnhance}
          className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-all duration-150 ease-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/90 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
        >
          <Sparkles className="h-4 w-4" />
          Enhance
        </button>
      </div>
    </>
  )
}

function PromptEnhancerHints() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-white/30">
      <span>
        <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
        {' + '}
        <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
        {' send'}
      </span>
      <span>
        <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
        {' + '}
        <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px]">⌫</kbd>
        {' clear'}
      </span>
    </div>
  )
}

export { PromptEnhancerPlugin }
