'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import type { LandingPost, LandingSettings, LandingSlide, LandingUi } from '@/lib/landing-posts'

interface RotatingPostsProps {
  posts: LandingPost[]
  settings: LandingSettings
  ui: LandingUi
}

function formatSlideTabLabel(template: string, index: number, total: number): string {
  return template.replace('{n}', String(index + 1)).replace('{total}', String(total))
}

function SlideLayer({
  slide,
  active,
  transitionMs,
}: {
  slide: LandingSlide
  active: boolean
  transitionMs: number
}) {
  const style = { transitionDuration: `${transitionMs}ms` }

  if (slide.type === 'image') {
    return (
      <div
        className={clsx('landing-stage__layer', active && 'is-active')}
        style={style}
        aria-hidden={!active}
      >
        <Image src={slide.src} alt="" fill className="landing-stage__image" sizes="100vw" unoptimized />
      </div>
    )
  }

  return (
    <div
      className={clsx('landing-stage__layer', 'landing-stage__layer--doc', active && 'is-active')}
      style={style}
      aria-hidden={!active}
    >
      <iframe
        src={slide.src}
        title={slide.subtitle}
        className="landing-stage__iframe"
        tabIndex={-1}
      />
    </div>
  )
}

export function RotatingPosts({ posts, settings, ui }: RotatingPostsProps) {
  const [postIndex, setPostIndex] = useState(0)
  const [slideIndex, setSlideIndex] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [timerEpoch, setTimerEpoch] = useState(0)

  const post = posts[postIndex]
  const slide = post?.slides[slideIndex]
  const slideCount = post?.slides.length ?? 0

  const resetTimer = useCallback(() => {
    setTimerEpoch((e) => e + 1)
  }, [])

  const goNext = useCallback(() => {
    if (!post) return
    if (slideIndex < post.slides.length - 1) {
      setSlideIndex((i) => i + 1)
      return
    }
    setSlideIndex(0)
    setPostIndex((i) => (i + 1) % posts.length)
  }, [post, slideIndex, posts.length])

  const goPrev = useCallback(() => {
    if (!post) return
    if (slideIndex > 0) {
      setSlideIndex((i) => i - 1)
      return
    }
    const prevPostIndex = (postIndex - 1 + posts.length) % posts.length
    const prevPost = posts[prevPostIndex]
    setPostIndex(prevPostIndex)
    setSlideIndex(prevPost.slides.length - 1)
  }, [post, postIndex, slideIndex, posts])

  const goToSlide = useCallback((index: number) => {
    setSlideIndex(index)
    resetTimer()
  }, [resetTimer])

  const handleNext = useCallback(() => {
    goNext()
    resetTimer()
  }, [goNext, resetTimer])

  const handlePrev = useCallback(() => {
    goPrev()
    resetTimer()
  }, [goPrev, resetTimer])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (reducedMotion || posts.length === 0) return
    const id = window.setInterval(goNext, settings.slide_interval_ms)
    return () => window.clearInterval(id)
  }, [goNext, reducedMotion, posts.length, settings.slide_interval_ms, timerEpoch])

  const slideIndicators = useMemo(
    () =>
      post?.slides.map((s, i) => ({
        key: `${post.id}-${s.src}-${i}`,
        active: i === slideIndex,
      })) ?? [],
    [post, slideIndex],
  )

  if (!post || !slide) return null

  const sourceLabel = slide.source_label ?? ui.source_link_label

  return (
    <section className="landing-stage" aria-live="polite" aria-atomic="true">
      <div className="landing-stage__backdrop">
        {post.slides.map((s, i) => (
          <SlideLayer
            key={`${post.id}-${s.src}-${i}`}
            slide={s}
            active={i === slideIndex}
            transitionMs={settings.transition_ms}
          />
        ))}
        <div className="landing-stage__scrim" />

        <button
          type="button"
          className="landing-stage__nav landing-stage__nav--prev"
          aria-label={ui.prev_slide_aria_label}
          onClick={handlePrev}
        >
          <i className="ri-arrow-left-s-line" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="landing-stage__nav landing-stage__nav--next"
          aria-label={ui.next_slide_aria_label}
          onClick={handleNext}
        >
          <i className="ri-arrow-right-s-line" aria-hidden="true" />
        </button>

        <div
          className="landing-stage__indicators"
          role="tablist"
          aria-label={ui.carousel_aria_label}
        >
          {slideIndicators.map((ind, i) => (
            <button
              key={ind.key}
              type="button"
              role="tab"
              aria-selected={ind.active}
              aria-label={formatSlideTabLabel(ui.slide_tab_aria_label_template, i, slideCount)}
              className={clsx('landing-stage__dot', ind.active && 'is-active')}
              onClick={() => goToSlide(i)}
            />
          ))}
        </div>
      </div>

      <div className="landing-stage__content">
        <p className="landing-stage__post-title">{post.title}</p>
        <h2 className="landing-stage__subtitle">{slide.subtitle}</h2>
        <p className="landing-stage__body">{slide.content}</p>
        {slide.source_url && (
          <a
            href={slide.source_url}
            className="landing-stage__source"
            target="_blank"
            rel="noopener noreferrer"
          >
            {sourceLabel}
          </a>
        )}
      </div>
    </section>
  )
}