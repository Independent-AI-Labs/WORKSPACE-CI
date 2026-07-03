'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { useAnalyticsStore } from '@/stores/analytics-store'

export function StoreHydration() {
  useEffect(() => {
    useThemeStore.getState().hydrate()
    useAnalyticsStore.getState().hydrate()
  }, [])

  return null
}
