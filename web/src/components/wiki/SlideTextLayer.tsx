'use client'

import Link from 'next/link'
import clsx from 'clsx'
import { isInternalSourceUrl, type LandingSlide } from '@/lib/landing-slide'
import type { PretextTypography } from '@/lib/landing-pretext'
import type { TransitionDirection } from '@/lib/landing-slide-transition'

interface SlideTextLayerProps {
  slide: LandingSlide
  active: boolean
  leaving: boolean
  transitionMs: number
  subtitleType: PretextTypography
  bodyType: PretextTypography
  reducedMotion: boolean
  showDownload: boolean
  showLinks: boolean
  downloadLabel: string
  sourceLabel: string
  layout?: 'carousel' | 'stacked'
  transitionDirection?: TransitionDirection
}

export function SlideTextLayer({
  slide,
  active,
  leaving,
  transitionMs,
  subtitleType,
  bodyType,
  reducedMotion,
  showDownload,
  showLinks,
  downloadLabel,
  sourceLabel,
  layout = 'carousel',
  transitionDirection = 1,
}: SlideTextLayerProps) {
  const layerStyle = {
    ['--landing-text-fade-ms' as string]: `${transitionMs}ms`,
    ['--landing-text-direction' as string]: String(transitionDirection),
  }

  const subtitleStyle = {
    font: subtitleType.font,
    lineHeight: `${subtitleType.lineHeightPx}px`,
    ...(slide.subtitle_color ? { color: slide.subtitle_color } : {}),
  }

  const bodyPanel = (
    <>
      <p
        className="landing-stage__body"
        style={{ font: bodyType.font, lineHeight: `${bodyType.lineHeightPx}px` }}
      >
        {slide.content}
      </p>

      {showLinks && (
        <div className="landing-stage__links">
          {showDownload && (
            <a href={slide.src} className="landing-stage__link landing-stage__link--download" download>
              <i className="ri-download-2-line" aria-hidden="true" />
              {downloadLabel}
            </a>
          )}
          {slide.source_url &&
            (isInternalSourceUrl(slide.source_url) ? (
              <Link href={slide.source_url} className="landing-stage__link landing-stage__link--internal">
                <i className="ri-arrow-right-s-line" aria-hidden="true" />
                {sourceLabel}
              </Link>
            ) : (
              <a
                href={slide.source_url}
                className="landing-stage__link landing-stage__link--external"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="ri-external-link-line" aria-hidden="true" />
                {sourceLabel}
              </a>
            ))}
        </div>
      )}
    </>
  )

  if (layout === 'stacked') {
    return (
      <div className="landing-stage__slide-panel landing-stage__slide-panel--stacked">
        <h2 className="landing-stage__subtitle landing-stage__subtitle--stacked" style={subtitleStyle}>
          {slide.subtitle}
        </h2>
        {bodyPanel}
      </div>
    )
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
        <h2 className="landing-stage__subtitle" style={subtitleStyle}>
          {slide.subtitle}
        </h2>
        {bodyPanel}
      </div>
    </div>
  )
}