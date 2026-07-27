'use client'

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useId,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

interface TooltipProps {
  text?: string
  html?: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

const HIDE_DELAY_MS = 200
const GAP_PX = 4
const VIEWPORT_PAD = 8

const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

const emptySubscribe = () => () => {}

function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}

function getPortalTarget(): HTMLElement {
  if (typeof document === 'undefined') return null as unknown as HTMLElement
  const dialog = document.querySelector('dialog[open]')
  if (dialog instanceof HTMLElement) return dialog
  return document.body
}

export function Tooltip({ text, html, children, position = 'top' }: TooltipProps) {
  const isClient = useIsClient()
  const tooltipId = useId()
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)

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

  useIsoLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()

    let top: number
    if (position === 'top') {
      top = triggerRect.top - tooltipRect.height - GAP_PX
      if (top < VIEWPORT_PAD) {
        top = triggerRect.bottom + GAP_PX
      }
    } else {
      top = triggerRect.bottom + GAP_PX
      if (top + tooltipRect.height > window.innerHeight - VIEWPORT_PAD) {
        top = triggerRect.top - tooltipRect.height - GAP_PX
      }
    }

    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
    if (left + tooltipRect.width > window.innerWidth - VIEWPORT_PAD) {
      left = window.innerWidth - tooltipRect.width - VIEWPORT_PAD
    }

    setCoords({ top, left })
  }, [visible, position, html, text])

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

  const tooltipStyle: CSSProperties = coords
    ? { top: coords.top, left: coords.left }
    : {}

  return (
    <>
      <span
        ref={triggerRef}
        className="tooltip-wrapper"
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        {...(isClient ? { 'aria-describedby': tooltipId } : {})}
      >
        {children}
      </span>
      {isClient && typeof document !== 'undefined' && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          id={tooltipId}
          className={clsx(
            'tooltip',
            `tooltip--${position}`,
            html && 'tooltip--html',
            visible && 'is-visible',
          )}
          style={tooltipStyle}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          {...(html ? { dangerouslySetInnerHTML: { __html: html } } : { children: text })}
        />,
        getPortalTarget(),
      )}
    </>
  )
}
