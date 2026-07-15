import Image from 'next/image'
import clsx from 'clsx'
import type { LandingSlide } from '@/lib/landing-posts'
import { panAxisStyle, type SlidePan } from '@/lib/landing-pan'

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
    slide.type !== 'image' && 'landing-stage__layer--doc',
    active && 'is-active',
    leaving && 'is-leaving',
  )

  const panClass = clsx(
    'landing-stage__pan',
    slide.type !== 'image' && 'landing-stage__pan--doc',
  )

  return (
    <div className={layerClass} style={layerStyle} aria-hidden={!active}>
      <div key={pan.token} className={panClass} style={panAxisStyle(pan.axis)}>
        {slide.type === 'image' ? (
          <Image src={slide.src} alt="" fill className="landing-stage__image" sizes="100vw" unoptimized />
        ) : (
          <iframe
            src={slide.src}
            title={slide.subtitle}
            className="landing-stage__iframe"
            tabIndex={-1}
          />
        )}
      </div>
    </div>
  )
}