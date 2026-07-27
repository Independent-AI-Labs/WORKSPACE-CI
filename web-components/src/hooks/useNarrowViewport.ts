'use client'

import { useEffect, useState } from 'react'

export function useNarrowViewport(maxWidthPx = 768): boolean {
  const query = `(max-width: ${maxWidthPx}px)`
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setIsNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])

  return isNarrow
}