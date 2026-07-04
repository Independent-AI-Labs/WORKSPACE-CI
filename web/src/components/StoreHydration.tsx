'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { useAnalyticsStore } from '@/stores/analytics-store'
import { useSidebarStore } from '@/stores/sidebar-store'

export function StoreHydration() {
  useEffect(() => {
    useThemeStore.getState().hydrate()
    useAnalyticsStore.getState().hydrate()
    useSidebarStore.getState().hydrate()
  }, [])

  return null
}
