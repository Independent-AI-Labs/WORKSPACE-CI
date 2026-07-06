'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSidebarStore } from '@/stores/sidebar-store'

export function MobileNavToggle() {
  const pathname = usePathname()
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)

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
      {!mobileOpen && (
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-expanded={mobileOpen}
          aria-controls="wiki-sidebar"
          aria-label="Open navigation menu"
          onClick={() => setMobileOpen(true)}
        >
          <i className="ri-menu-line" aria-hidden="true" />
        </button>
      )}
      {mobileOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  )
}
