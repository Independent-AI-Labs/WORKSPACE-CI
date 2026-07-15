'use client'

import { useEffect, useLayoutEffect } from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { useAnalyticsStore } from '@/stores/analytics-store'
import { useSidebarStore } from '@/stores/sidebar-store'

export function StoreHydration() {
  useLayoutEffect(() => {
    useSidebarStore.getState().hydrate()
  }, [])

  useEffect(() => {
    useThemeStore.getState().hydrate()
    useAnalyticsStore.getState().hydrate()
  }, [])

  return null
}
