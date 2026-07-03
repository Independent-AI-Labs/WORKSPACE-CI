'use client'

import { useEffect, useRef } from 'react'
import { useAnalyticsStore } from '@/stores/analytics-store'

export function usePageVisibility(path: string): void {
  const track = useAnalyticsStore((s) => s.track)
  const startRef = useRef(0)
  const dwellRef = useRef(0)
  const maxScrollRef = useRef(0)
  const trackedRef = useRef(false)

  useEffect(() => {
    if (typeof document === 'undefined') return

    // Only start the foreground timer when the document is actually
    // visible. During prerender or when hidden, the timer stays paused
    // until the visibilitychange handler resumes it.
    if (document.visibilityState === 'visible') {
      startRef.current = Date.now()
    }
    dwellRef.current = 0
    maxScrollRef.current = 0
    trackedRef.current = false

    const flushDwell = () => {
      if (trackedRef.current) return
      if (document.visibilityState === 'visible') {
        dwellRef.current += Date.now() - startRef.current
        startRef.current = Date.now()
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        dwellRef.current += Date.now() - startRef.current
      } else if (document.visibilityState === 'visible') {
        startRef.current = Date.now()
      }
    }

    const handleScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      if (scrollable > 0) {
        const percent = Math.round((window.scrollY / scrollable) * 100)
        if (percent > maxScrollRef.current) {
          maxScrollRef.current = percent
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      flushDwell()
      trackedRef.current = true
      track({
        type: 'page_exit',
        path,
        dwellMs: dwellRef.current,
        maxScrollPercent: maxScrollRef.current,
        timestamp: Date.now(),
        sessionId: useAnalyticsStore.getState().sessionId,
      })
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [path, track])
}
