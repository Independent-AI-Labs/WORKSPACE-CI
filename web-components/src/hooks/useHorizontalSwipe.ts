'use client'

import { useCallback, useRef, type TouchEvent } from 'react'

const SWIPE_THRESHOLD_PX = 48

export function useHorizontalSwipe(onPrev: () => void, onNext: () => void) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.changedTouches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      const start = touchStartRef.current
      touchStartRef.current = null
      const touch = event.changedTouches[0]
      if (!start || !touch) return

      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return

      if (deltaX < 0) {
        onNext()
      } else {
        onPrev()
      }
    },
    [onNext, onPrev],
  )

  return { onTouchStart, onTouchEnd }
}