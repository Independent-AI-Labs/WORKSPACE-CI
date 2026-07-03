'use client'

import { useState, useRef, useEffect, useId } from 'react'
import clsx from 'clsx'

type CopyState = 'idle' | 'copying' | 'copied' | 'failed'

const RESET_DELAY_MS = 2000

interface CopyButtonProps {
  text: string
  className?: string
  label?: string
  copiedLabel?: string
  failedLabel?: string
}

export function CopyButton({
  text,
  className,
  label = 'Copy',
  copiedLabel = 'Copied',
  failedLabel = 'Copy failed',
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveRegionId = useId()

  async function handleCopy() {
    if (state === 'copying') return
    setState('copying')

    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch (err) {
      console.error('Clipboard write failed:', err)
      setState('failed')
    }

    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setState('idle'), RESET_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const displayLabel =
    state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : label

  return (
    <>
      <button
        type="button"
        className={clsx('copy-button', `is-${state}`, className)}
        onClick={handleCopy}
        disabled={state === 'copying'}
        aria-describedby={liveRegionId}
      >
        {displayLabel}
      </button>
      <span
        id={liveRegionId}
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : ''}
      </span>
    </>
  )
}
