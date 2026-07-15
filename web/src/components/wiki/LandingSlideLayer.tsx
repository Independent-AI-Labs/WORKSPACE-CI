import clsx from 'clsx'
import type { LandingSlide } from '@/lib/landing-posts'
import { landingPdfEmbedSrc } from '@/lib/landing-pdf-embed'
import { panMotionStyle, type SlidePan } from '@/lib/landing-pan'

export function LandingSlideLayer({
  slide,
  active,
  leaving,
  transitionMs,
  panDurationMs,
  pan,
}: {
  slide: LandingSlide
  active: boolean
  leaving: boolean
  transitionMs: number
  panDurationMs: number
  pan: SlidePan
}) {
  const layerStyle = {
    ['--landing-fade-ms' as string]: `${transitionMs}ms`,
    ['--landing-pan-duration' as string]: `${panDurationMs}ms`,
  }

  const layerClass = clsx(
    'landing-stage__layer',
    slide.type === 'image' && 'landing-stage__layer--image',
    slide.type !== 'image' && 'landing-stage__layer--doc',
    active && 'is-active',
    leaving && 'is-leaving',
  )

  const panClass = 'landing-stage__pan'

  return (
    <div className={layerClass} style={layerStyle} aria-hidden={!active}>
      <div className="landing-stage__pan-parallax">
        <div key={pan.token} className={panClass} style={panMotionStyle(pan)}>
          {slide.type === 'image' ? (
            <img src={slide.src} alt="" className="landing-stage__image" decoding="async" />
          ) : (
            <iframe
              src={slide.type === 'document' ? landingPdfEmbedSrc(slide.src) : slide.src}
              title={slide.subtitle}
              className={clsx(
                'landing-stage__iframe',
                slide.type === 'document' && 'landing-stage__iframe--pdf',
              )}
              tabIndex={-1}
            />
          )}
        </div>
      </div>
    </div>
  )
}