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

  if (slide.type === 'image') {
    return (
      <div
        className={clsx(
          'landing-stage__layer',
          active && 'is-active',
          leaving && 'is-leaving',
        )}
        style={layerStyle}
        aria-hidden={!active}
      >
        <div
          key={pan.token}
          className="landing-stage__pan"
          style={panAxisStyle(pan.axis)}
        >
          <Image src={slide.src} alt="" fill className="landing-stage__image" sizes="100vw" unoptimized />
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'landing-stage__layer',
        'landing-stage__layer--doc',
        active && 'is-active',
        leaving && 'is-leaving',
      )}
      style={layerStyle}
      aria-hidden={!active}
    >
      <div
        key={pan.token}
        className="landing-stage__pan landing-stage__pan--doc"
        style={panAxisStyle(pan.axis)}
      >
        <iframe
          src={slide.src}
          title={slide.subtitle}
          className="landing-stage__iframe"
          tabIndex={-1}
        />
      </div>
    </div>
  )
}