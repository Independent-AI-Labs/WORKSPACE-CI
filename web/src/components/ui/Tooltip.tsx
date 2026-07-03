'use client'

import {
  useState,
  useRef,
  useEffect,
  useId,
  type ReactNode,
} from 'react'
import clsx from 'clsx'

interface TooltipProps {
  text: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

const HIDE_DELAY_MS = 200

export function Tooltip({ text, children, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  function show() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setVisible(true)
  }

  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS)
  }

  useEffect(() => {
    if (!visible) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setVisible(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible])

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  return (
    <span
      className="tooltip-wrapper"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
      aria-describedby={tooltipId}
    >
      {children}
      <span
        role="tooltip"
        id={tooltipId}
        className={clsx('tooltip', `tooltip--${position}`, visible && 'is-visible')}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        {text}
      </span>
    </span>
  )
}
