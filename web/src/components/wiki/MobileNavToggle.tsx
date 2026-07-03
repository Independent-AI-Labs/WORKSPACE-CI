'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

export function MobileNavToggle() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const [prevPath, setPrevPath] = useState(pathname)
  if (pathname !== prevPath) {
    setPrevPath(pathname)
    if (isOpen) setIsOpen(false)
  }

  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const sidebar = document.getElementById('wiki-sidebar')
    if (sidebar) {
      sidebar.classList.toggle('is-open', isOpen)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-expanded={isOpen}
        aria-controls="wiki-sidebar"
        aria-label="Toggle navigation menu"
        onClick={() => setIsOpen(!isOpen)}
      >
        <i className={isOpen ? 'ri-close-line' : 'ri-menu-line'} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={close}
          aria-hidden="true"
        />
      )}
    </>
  )
}
