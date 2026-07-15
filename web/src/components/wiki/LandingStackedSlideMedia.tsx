'use client'

import clsx from 'clsx'
import type { LandingSlide } from '@/lib/landing-slide'
import { landingPdfPreviewImageSrc } from '@/lib/landing-pdf-render'
import { GESTURE_CANVAS_BASE_ZOOM } from '@/lib/gesture-canvas'
import { LandingStackedGestureCanvas } from '@/components/wiki/LandingStackedGestureCanvas'

interface LandingStackedSlideMediaProps {
  slide: LandingSlide
}

export function LandingStackedSlideMedia({ slide }: LandingStackedSlideMediaProps) {
  const isImage = slide.type === 'image'
  const mediaSrc = isImage ? slide.src : landingPdfPreviewImageSrc(slide.src)

  return (
    <div
      className={clsx(
        'landing-stage__stacked-pan',
        isImage ? 'landing-stage__stacked-pan--image' : 'landing-stage__stacked-pan--doc',
      )}
    >
      <LandingStackedGestureCanvas src={mediaSrc} baseZoom={GESTURE_CANVAS_BASE_ZOOM} />
    </div>
  )
}