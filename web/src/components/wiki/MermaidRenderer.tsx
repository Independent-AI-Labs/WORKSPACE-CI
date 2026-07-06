'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function MermaidRenderer() {
  const pathname = usePathname()
  const initialized = useRef(false)

  useEffect(() => {
    let cancelled = false
    import('mermaid').then(({ default: mermaid }) => {
      if (cancelled) return
      if (!initialized.current) {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
        })
        initialized.current = true
      }
      const elements = document.querySelectorAll('.mermaid')
      if (elements.length > 0) {
        mermaid.run({ querySelector: '.mermaid' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  return null
}
