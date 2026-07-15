'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'
import { useSidebarStore } from '@/stores/sidebar-store'

export function MobileNavToggle() {
  const pathname = usePathname()
  const isNarrow = useNarrowViewport()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)
  const toggle = useSidebarStore((s) => s.toggle)

  useEffect(() => {
    const sidebar = document.getElementById('wiki-sidebar')
    if (sidebar) {
      sidebar.classList.toggle('is-open', mobileOpen)
    }
  }, [mobileOpen])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  useEffect(() => {
    if (!mobileOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen, setMobileOpen])

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-expanded={isNarrow ? mobileOpen : !collapsed}
        aria-controls="wiki-sidebar"
        aria-label={isNarrow ? 'Open navigation menu' : 'Expand sidebar'}
        onClick={() => (isNarrow ? setMobileOpen(true) : toggle())}
      >
        <i className="ri-menu-line" aria-hidden="true" />
      </button>
      {isNarrow && mobileOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  )
}
