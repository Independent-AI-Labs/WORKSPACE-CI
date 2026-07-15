'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function formatPostTabLabel(template: string, label: string): string {
  return template.replace('{label}', label)
}

function postTabLabel(post: LandingPost): string {
  return post.tab_label ?? post.title
}

function SlideLayer({
  slide,
  active,
  leaving,
  transitionMs,
  panDurationMs,
}: {
  slide: LandingSlide
  active: boolean
  leaving: boolean
  transitionMs: number
  panDurationMs: number
}) {
  const layerStyle = {
    transitionDuration: `${transitionMs}ms`,
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
        <div className="landing-stage__pan">
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
      <div className="landing-stage__pan landing-stage__pan--doc">
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

export function RotatingPosts({ posts, settings, ui }: RotatingPostsProps) {
  const [postIndex, setPostIndex] = useState(0)
  const [slideIndex, setSlideIndex] = useState(0)
  const [leavingSlideIndex, setLeavingSlideIndex] = useState<number | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [timerEpoch, setTimerEpoch] = useState(0)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const post = posts[postIndex]
  const slide = post?.slides[slideIndex]
  const slideCount = post?.slides.length ?? 0

  const resetTimer = useCallback(() => {
    setTimerEpoch((e) => e + 1)
  }, [])

  const transitionToSlide = useCallback(
    (nextIndex: number) => {
      if (!post || nextIndex === slideIndex) return
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
      }
      setLeavingSlideIndex(slideIndex)
      setSlideIndex(nextIndex)
      leaveTimerRef.current = setTimeout(() => {
        setLeavingSlideIndex(null)
        leaveTimerRef.current = null
      }, settings.transition_ms)
    },
    [post, slideIndex, settings.transition_ms],
  )

  const goNext = useCallback(() => {
    if (!post) return
    const nextIndex = (slideIndex + 1) % post.slides.length
    transitionToSlide(nextIndex)
  }, [post, slideIndex, transitionToSlide])

  const goPrev = useCallback(() => {
    if (!post) return
    const nextIndex = (slideIndex - 1 + post.slides.length) % post.slides.length
    transitionToSlide(nextIndex)
  }, [post, slideIndex, transitionToSlide])

  const goToPost = useCallback(
    (index: number) => {
      if (index === postIndex) return
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      setLeavingSlideIndex(null)
      setPostIndex(index)
      setSlideIndex(0)
      resetTimer()
    },
    [postIndex, resetTimer],
  )

  const goToSlide = useCallback(
    (index: number) => {
      transitionToSlide(index)
      resetTimer()
    },
    [transitionToSlide, resetTimer],
  )

  const handleNext = useCallback(() => {
    goNext()
    resetTimer()
  }, [goNext, resetTimer])

  const handlePrev = useCallback(() => {
    goPrev()
    resetTimer()
  }, [goPrev, resetTimer])

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
      }
    }
  }, [])

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
  const downloadLabel = slide.download_label ?? ui.download_link_label
  const showDownload = slide.type === 'document'
  const showLinks = showDownload || Boolean(slide.source_url)

  return (
    <section className="landing-stage" aria-live="polite" aria-atomic="true">
      <div className="landing-stage__viewport">
        <div className="landing-stage__backdrop">
          {post.slides.map((s, i) => (
            <SlideLayer
              key={`${post.id}-${s.src}-${i}`}
              slide={s}
              active={i === slideIndex}
              leaving={i === leavingSlideIndex}
              transitionMs={settings.transition_ms}
              panDurationMs={settings.background_pan_duration_ms}
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

          <div className="landing-stage__indicators" role="group" aria-label={ui.carousel_aria_label}>
            {slideIndicators.map((ind, i) => (
              <button
                key={ind.key}
                type="button"
                aria-current={ind.active ? 'true' : undefined}
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

      <div
        className="landing-stage__post-tabs"
        role="tablist"
        aria-label={ui.posts_tablist_aria_label}
      >
        {posts.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === postIndex}
            aria-label={formatPostTabLabel(ui.post_tab_aria_label_template, postTabLabel(p))}
            className={clsx('landing-stage__post-tab', i === postIndex && 'is-active')}
            onClick={() => goToPost(i)}
          >
            {postTabLabel(p)}
          </button>
        ))}
      </div>
    </section>
  )
}