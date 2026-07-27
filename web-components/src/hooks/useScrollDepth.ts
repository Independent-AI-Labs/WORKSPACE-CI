'use client'

import { useRef, useEffect } from 'react'

export function useScrollDepth(path: string): React.MutableRefObject<number> {
  const maxScrollRef = useRef(0)

  useEffect(() => {
    maxScrollRef.current = 0

    const handleScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      if (scrollable > 0) {
        const percent = Math.round((window.scrollY / scrollable) * 100)
        if (percent > maxScrollRef.current) {
          maxScrollRef.current = percent
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [path])

  return maxScrollRef
}
