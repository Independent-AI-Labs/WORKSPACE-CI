'use client'

import clsx from 'clsx'
import type { LandingSlide } from '@/lib/landing-posts'
import type { PretextTypography } from '@/lib/landing-pretext'
import { measureSlideTextHeight } from '@/lib/landing-pretext'

interface SlideTextLayerProps {
  slide: LandingSlide
  active: boolean
  leaving: boolean
  transitionMs: number
  textWidth: number
  subtitleType: PretextTypography
  bodyType: PretextTypography
  reducedMotion: boolean
  showDownload: boolean
  showLinks: boolean
  downloadLabel: string
  sourceLabel: string
}

export function SlideTextLayer({
  slide,
  active,
  leaving,
  transitionMs,
  textWidth,
  subtitleType,
  bodyType,
  reducedMotion,
  showDownload,
  showLinks,
  downloadLabel,
  sourceLabel,
}: SlideTextLayerProps) {
  const measuredHeight =
    textWidth > 0
      ? measureSlideTextHeight(slide.subtitle, slide.content, textWidth, subtitleType, bodyType)
      : null

  const layerStyle = {
    transitionDuration: `${transitionMs}ms`,
    minHeight: measuredHeight ? `${measuredHeight}px` : undefined,
  }

  return (
    <div
      className={clsx(
        'landing-stage__text-layer',
        active && 'is-active',
        leaving && 'is-leaving',
        reducedMotion && 'is-reduced-motion',
      )}
      style={layerStyle}
      aria-hidden={!active}
    >
      <div className="landing-stage__slide-panel">
        <h2 className="landing-stage__subtitle">{slide.subtitle}</h2>
        <p className="landing-stage__body">{slide.content}</p>

        {showLinks && (
          <div className="landing-stage__links">
            {showDownload && (
              <a href={slide.src} className="landing-stage__link landing-stage__link--download" download>
                <i className="ri-download-2-line" aria-hidden="true" />
                {downloadLabel}
              </a>
            )}
            {slide.source_url && (
              <a
                href={slide.source_url}
                className="landing-stage__link landing-stage__link--external"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="ri-external-link-line" aria-hidden="true" />
                {sourceLabel}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}