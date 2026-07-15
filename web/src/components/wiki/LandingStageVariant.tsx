'use client'

import type { ReactNode } from 'react'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'

interface LandingStageVariantProps {
  mode: 'stacked' | 'carousel'
  children: ReactNode
}

export function LandingStageVariant({ mode, children }: LandingStageVariantProps) {
  const isNarrow = useNarrowViewport(768)
  const hidden = mode === 'stacked' ? !isNarrow : isNarrow

  return (
    <div
      className={`landing-stage__variant landing-stage__variant--${mode}`}
      aria-hidden={hidden || undefined}
    >
      {children}
    </div>
  )
}