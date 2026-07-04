'use client'

import { create } from 'zustand'

const STORAGE_KEY = 'sidebar-collapsed'
const COLLAPSED_WIDTH = '56px'
const EXPANDED_WIDTH = 'auto'

function applyCollapsed(collapsed: boolean): void {
  if (typeof document !== 'undefined') {
    if (collapsed) {
      document.documentElement.setAttribute('data-sidebar-collapsed', 'true')
      document.documentElement.style.setProperty('--sidebar-width', COLLAPSED_WIDTH)
    } else {
      document.documentElement.removeAttribute('data-sidebar-collapsed')
      document.documentElement.style.setProperty('--sidebar-width', EXPANDED_WIDTH)
    }
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }
}

interface SidebarStore {
  collapsed: boolean
  toggle: () => void
  hydrate: () => void
}

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  collapsed: false,
  toggle: () => {
    const next = !get().collapsed
    applyCollapsed(next)
    set({ collapsed: next })
  },
  hydrate: () => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-sidebar-collapsed')
      const isCollapsed = attr === 'true'
      applyCollapsed(isCollapsed)
      set({ collapsed: isCollapsed })
    }
  },
}))
