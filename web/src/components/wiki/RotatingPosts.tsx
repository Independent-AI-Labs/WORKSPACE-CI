'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { LandingPost, LandingSettings, LandingUi } from '@/lib/landing-posts'
import {
  assignPanAxisForSlide,
  buildInitialPanMap,
  panSlideKey,
  resolveSlidePan,
  type SlidePan,
} from '@/lib/landing-pan'
import {
  measureSlideTextHeight,
  typographyFromComputed,
  type PretextTypography,
} from '@/lib/landing-pretext'
import { LandingSlideLayer } from '@/components/wiki/LandingSlideLayer'
import { SlideTextLayer } from '@/components/wiki/SlideTextLayer'

interface RotatingPostsProps {
  posts: LandingPost[]
  settings: LandingSettings
  ui: LandingUi
}

type SlidePosition = { postIndex: number; slideIndex: number }

function sameSlidePosition(a: SlidePosition, b: SlidePosition): boolean {
  return a.postIndex === b.postIndex && a.slideIndex === b.slideIndex
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

export function RotatingPosts({ posts, settings, ui }: RotatingPostsProps) {
  const [activeSlide, setActiveSlide] = useState<SlidePosition>({ postIndex: 0, slideIndex: 0 })
  const [leavingSlide, setLeavingSlide] = useState<SlidePosition | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [timerEpoch, setTimerEpoch] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const [subtitleType, setSubtitleType] = useState<PretextTypography | null>(null)
  const [bodyType, setBodyType] = useState<PretextTypography | null>(null)
  const [panBySlide, setPanBySlide] = useState<Record<string, SlidePan>>({})
  const [prefadingSlideIndex, setPrefadingSlideIndex] = useState<number | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSlideRef = useRef(activeSlide)
  const contentRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeSlideRef.current = activeSlide
  }, [activeSlide])

  const postIndex = activeSlide.postIndex
  const slideIndex = activeSlide.slideIndex
  const post = posts[postIndex]
  const slide = post?.slides[slideIndex]
  const slideCount = post?.slides.length ?? 0

  const initialPanBySlide = useMemo(() => buildInitialPanMap(posts), [posts])

  const fadeLeadMs = Math.min(900, Math.max(400, Math.floor(settings.transition_ms * 0.65)))

  const resetTimer = useCallback(() => {
    setPrefadingSlideIndex(null)
    setTimerEpoch((e) => e + 1)
  }, [])

  const scheduleLeaveClear = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
    }
    leaveTimerRef.current = setTimeout(() => {
      setLeavingSlide(null)
      setPrefadingSlideIndex(null)
      leaveTimerRef.current = null
    }, settings.transition_ms)
  }, [settings.transition_ms])

  const beginTransition = useCallback(
    (incoming: SlidePosition) => {
      const outgoing = activeSlideRef.current
      if (sameSlidePosition(outgoing, incoming)) return

      const targetPost = posts[incoming.postIndex]
      if (!targetPost) return

      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      if (prefadeTimerRef.current) {
        clearTimeout(prefadeTimerRef.current)
        prefadeTimerRef.current = null
      }
      setPrefadingSlideIndex(null)

      setPanBySlide((prev) =>
        assignPanAxisForSlide(
          prev,
          targetPost.id,
          incoming.slideIndex,
          initialPanBySlide[panSlideKey(targetPost.id, incoming.slideIndex)],
        ),
      )

      setLeavingSlide(outgoing)
      setActiveSlide(incoming)
      scheduleLeaveClear()
    },
    [initialPanBySlide, posts, scheduleLeaveClear],
  )

  const transitionToSlide = useCallback(
    (nextIndex: number) => {
      beginTransition({ postIndex: activeSlide.postIndex, slideIndex: nextIndex })
    },
    [activeSlide.postIndex, beginTransition],
  )

  const transitionToPost = useCallback(
    (index: number, nextSlideIndex = 0) => {
      beginTransition({ postIndex: index, slideIndex: nextSlideIndex })
    },
    [beginTransition],
  )

  const goNext = useCallback(() => {
    if (!post) return
    if (slideIndex < post.slides.length - 1) {
      transitionToSlide(slideIndex + 1)
      return
    }
    if (posts.length > 1) {
      transitionToPost((postIndex + 1) % posts.length, 0)
      return
    }
    transitionToSlide(0)
  }, [post, postIndex, posts.length, slideIndex, transitionToPost, transitionToSlide])

  const goPrev = useCallback(() => {
    if (!post) return
    if (slideIndex > 0) {
      transitionToSlide(slideIndex - 1)
      return
    }
    if (posts.length > 1) {
      const prevPostIndex = (postIndex - 1 + posts.length) % posts.length
      const prevPost = posts[prevPostIndex]
      if (!prevPost) return
      transitionToPost(prevPostIndex, prevPost.slides.length - 1)
      return
    }
    transitionToSlide(post.slides.length - 1)
  }, [post, postIndex, posts, slideIndex, transitionToPost, transitionToSlide])

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

  const handlePostTab = useCallback(
    (index: number) => {
      transitionToPost(index, 0)
      resetTimer()
    },
    [resetTimer, transitionToPost],
  )

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
      }
      if (prefadeTimerRef.current) {
        clearTimeout(prefadeTimerRef.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    const content = contentRef.current
    const probe = probeRef.current
    if (!content || !probe) return

    const sync = () => {
      const width = content.clientWidth
      setContentWidth(width)
      const subtitleEl = probe.querySelector('.landing-stage__subtitle')
      const bodyEl = probe.querySelector('.landing-stage__body')
      if (subtitleEl instanceof HTMLElement && bodyEl instanceof HTMLElement) {
        setSubtitleType(typographyFromComputed(getComputedStyle(subtitleEl)))
        setBodyType(typographyFromComputed(getComputedStyle(bodyEl)))
      }
    }

    sync()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(sync)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (reducedMotion || posts.length === 0) return
    if (prefadeTimerRef.current) {
      clearTimeout(prefadeTimerRef.current)
    }
    const delay = Math.max(0, settings.slide_interval_ms - fadeLeadMs)
    prefadeTimerRef.current = setTimeout(() => {
      setPrefadingSlideIndex(slideIndex)
      prefadeTimerRef.current = null
    }, delay)
    return () => {
      if (prefadeTimerRef.current) {
        clearTimeout(prefadeTimerRef.current)
        prefadeTimerRef.current = null
      }
    }
  }, [
    fadeLeadMs,
    posts.length,
    reducedMotion,
    settings.slide_interval_ms,
    slideIndex,
    timerEpoch,
  ])

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

  const crossPostLeaving =
    leavingSlide !== null && leavingSlide.postIndex !== activeSlide.postIndex
      ? leavingSlide
      : null

  // Keep every post mounted so cross-post crossfades have painted start states.
  const renderedPostIndices = useMemo(() => posts.map((_, i) => i), [posts])

  const slideIndicators = useMemo(
    () =>
      post?.slides.map((s, i) => ({
        key: `${post.id}-${s.src}-${i}`,
        active: i === slideIndex,
      })) ?? [],
    [post, slideIndex],
  )

  const subtitleTypography = subtitleType ?? { font: '700 42px Montserrat', lineHeightPx: 52.5 }
  const bodyTypography = bodyType ?? { font: '400 28px Montserrat', lineHeightPx: 45.5 }

  const textStackHeight = useMemo(() => {
    if (contentWidth <= 0) return undefined
    let maxHeight = 0
    for (const p of posts) {
      for (const s of p.slides) {
        const includeLinks = s.type === 'document' || Boolean(s.source_url)
        maxHeight = Math.max(
          maxHeight,
          measureSlideTextHeight(
            s.subtitle,
            s.content,
            contentWidth,
            subtitleTypography,
            bodyTypography,
            includeLinks,
          ),
        )
      }
    }
    return maxHeight > 0 ? `${maxHeight}px` : undefined
  }, [bodyTypography, contentWidth, posts, subtitleTypography])

  if (!post || !slide) return null

  const leavingPostTitle =
    crossPostLeaving !== null ? posts[crossPostLeaving.postIndex]?.title : null

  return (
    <section className="landing-stage" aria-live="polite" aria-atomic="true">
      <div className="landing-stage__viewport">
        <div
          className={clsx(
            'landing-stage__backdrop',
            prefadingSlideIndex !== null && leavingSlide === null && 'is-bg-prefading',
            leavingSlide !== null && 'is-bg-crossfading',
          )}
          style={{
            ['--landing-fade-ms' as string]: `${settings.transition_ms}ms`,
            ['--landing-prefade-ms' as string]: `${fadeLeadMs}ms`,
          }}
        >
          <div className="landing-stage__media">
            {renderedPostIndices.map((pi) => {
              const renderedPost = posts[pi]
              if (!renderedPost) return null
              return renderedPost.slides.map((s, i) => {
                const isLeaving =
                  leavingSlide !== null &&
                  leavingSlide.postIndex === pi &&
                  leavingSlide.slideIndex === i
                return (
                  <LandingSlideLayer
                    key={`${renderedPost.id}-${s.src}-${i}`}
                    slide={s}
                    active={
                      activeSlide.postIndex === pi && activeSlide.slideIndex === i && !isLeaving
                    }
                    leaving={isLeaving}
                    transitionMs={settings.transition_ms}
                    panDurationMs={settings.background_pan_duration_ms}
                    pan={resolveSlidePan(panBySlide, initialPanBySlide, renderedPost.id, i)}
                  />
                )
              })
            })}
          </div>
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

        <div className="landing-stage__content" ref={contentRef}>
          <div className="landing-stage__pretext-probe" ref={probeRef} aria-hidden="true">
            <span className="landing-stage__subtitle">Probe</span>
            <span className="landing-stage__body">Probe</span>
          </div>

          <div
            className="landing-stage__title-stack"
            style={{ ['--landing-fade-ms' as string]: `${settings.transition_ms}ms` }}
          >
            {leavingPostTitle && (
              <p className="landing-stage__post-title is-leaving">{leavingPostTitle}</p>
            )}
            <p className="landing-stage__post-title is-active">{post.title}</p>
          </div>

          <div
            className="landing-stage__text-stack"
            style={textStackHeight ? { height: textStackHeight } : undefined}
          >
            {renderedPostIndices.map((pi) => {
              const renderedPost = posts[pi]
              if (!renderedPost) return null
              return renderedPost.slides.map((s, i) => {
                const slideShowDownload = s.type === 'document'
                const slideShowLinks = slideShowDownload || Boolean(s.source_url)
                const isLeaving =
                  leavingSlide !== null &&
                  leavingSlide.postIndex === pi &&
                  leavingSlide.slideIndex === i
                return (
                  <SlideTextLayer
                    key={`${renderedPost.id}-text-${s.src}-${i}`}
                    slide={s}
                    active={
                      activeSlide.postIndex === pi && activeSlide.slideIndex === i && !isLeaving
                    }
                    leaving={isLeaving}
                    transitionMs={settings.transition_ms}
                    subtitleType={subtitleTypography}
                    bodyType={bodyTypography}
                    reducedMotion={reducedMotion}
                    showDownload={slideShowDownload}
                    showLinks={slideShowLinks}
                    downloadLabel={s.download_label ?? ui.download_link_label}
                    sourceLabel={s.source_label ?? ui.source_link_label}
                  />
                )
              })
            })}
          </div>
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
            onClick={() => handlePostTab(i)}
          >
            {postTabLabel(p)}
          </button>
        ))}
      </div>
    </section>
  )
}