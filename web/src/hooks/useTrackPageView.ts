'use client'

import { useEffect } from 'react'
import { useAnalyticsStore } from '@/stores/analytics-store'

export function useTrackPageView(path: string, title: string): void {
  const track = useAnalyticsStore((s) => s.track)

  useEffect(() => {
    track({
      type: 'page_view',
      path,
      title,
      timestamp: Date.now(),
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      sessionId: useAnalyticsStore.getState().sessionId,
    })
  }, [path, title, track])
}
