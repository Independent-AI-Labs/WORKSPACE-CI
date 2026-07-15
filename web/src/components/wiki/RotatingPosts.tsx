'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import type { LandingPost, LandingSettings, LandingSlide, LandingUi } from '@/lib/landing-posts'
import {
  measureSlideTextHeight,
  typographyFromComputed,
  type PretextTypography,
} from '@/lib/landing-pretext'
import { SlideTextLayer } from '@/components/wiki/SlideTextLayer'

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

type PanAxis = { x: 1 | -1; y: 1 | -1 }

type SlidePan = { axis: PanAxis; token: number }

const DEFAULT_PAN: SlidePan = { axis: { x: 1, y: 1 }, token: 0 }

function randomPanAxis(): PanAxis {
  return {
    x: Math.random() < 0.5 ? 1 : -1,
    y: Math.random() < 0.5 ? 1 : -1,
  }
}

function panSlideKey(postId: string, slideIndex: number): string {
  return `${postId}-${slideIndex}`
}

function assignPanAxisForSlide(
  prev: Record<string, SlidePan>,
  postId: string,
  slideIndex: number,
  seed?: SlidePan,
): Record<string, SlidePan> {
  const key = panSlideKey(postId, slideIndex)
  return {
    ...prev,
    [key]: {
      axis: randomPanAxis(),
      token: (prev[key]?.token ?? seed?.token ?? 0) + 1,
    },
  }
}

function buildInitialPanMap(posts: LandingPost[]): Record<string, SlidePan> {
  const map: Record<string, SlidePan> = {}
  for (const p of posts) {
    for (let i = 0; i < p.slides.length; i++) {
      map[panSlideKey(p.id, i)] = { axis: randomPanAxis(), token: 1 }
    }
  }
  return map
}

function resolveSlidePan(
  panBySlide: Record<string, SlidePan>,
  initialPanBySlide: Record<string, SlidePan>,
  postId: string,
  slideIndex: number,
): SlidePan {
  const key = panSlideKey(postId, slideIndex)
  return panBySlide[key] ?? initialPanBySlide[key] ?? DEFAULT_PAN
}

function SlideLayer({
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
          style={{
            ['--pan-x' as string]: pan.axis.x,
            ['--pan-y' as string]: pan.axis.y,
          }}
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
        style={{
          ['--pan-x' as string]: pan.axis.x,
          ['--pan-y' as string]: pan.axis.y,
        }}
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

export function RotatingPosts({ posts, settings, ui }: RotatingPostsProps) {
  const [postIndex, setPostIndex] = useState(0)
  const [slideIndex, setSlideIndex] = useState(0)
  const [leavingSlideIndex, setLeavingSlideIndex] = useState<number | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [timerEpoch, setTimerEpoch] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const [subtitleType, setSubtitleType] = useState<PretextTypography | null>(null)
  const [bodyType, setBodyType] = useState<PretextTypography | null>(null)
  const [panBySlide, setPanBySlide] = useState<Record<string, SlidePan>>({})
  const [prefadingSlideIndex, setPrefadingSlideIndex] = useState<number | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)

  const post = posts[postIndex]
  const slide = post?.slides[slideIndex]
  const slideCount = post?.slides.length ?? 0

  const initialPanBySlide = useMemo(() => buildInitialPanMap(posts), [posts])

  const fadeLeadMs = Math.min(900, Math.max(400, Math.floor(settings.transition_ms * 0.65)))

  const resetTimer = useCallback(() => {
    setPrefadingSlideIndex(null)
    setTimerEpoch((e) => e + 1)
  }, [])

  const transitionToSlide = useCallback(
    (nextIndex: number) => {
      if (!post || nextIndex === slideIndex) return
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
      }
      if (prefadeTimerRef.current) {
        clearTimeout(prefadeTimerRef.current)
        prefadeTimerRef.current = null
      }
      const outgoing = slideIndex
      setPanBySlide((prev) =>
        assignPanAxisForSlide(
          prev,
          post.id,
          nextIndex,
          initialPanBySlide[panSlideKey(post.id, nextIndex)],
        ),
      )
      setLeavingSlideIndex(outgoing)
      setSlideIndex(nextIndex)
      leaveTimerRef.current = setTimeout(() => {
        setLeavingSlideIndex(null)
        setPrefadingSlideIndex(null)
        leaveTimerRef.current = null
      }, settings.transition_ms)
    },
    [initialPanBySlide, post, slideIndex, settings.transition_ms],
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
      const targetPost = posts[index]
      if (!targetPost) return
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      setPrefadingSlideIndex(null)
      setLeavingSlideIndex(null)
      setPanBySlide((prev) =>
        assignPanAxisForSlide(prev, targetPost.id, 0, initialPanBySlide[panSlideKey(targetPost.id, 0)]),
      )
      setPostIndex(index)
      setSlideIndex(0)
      resetTimer()
    },
    [initialPanBySlide, postIndex, posts, resetTimer],
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

  const textStackMinHeight = useMemo(() => {
    if (!post || contentWidth <= 0) return undefined
    const indices = new Set<number>([slideIndex])
    if (leavingSlideIndex !== null) indices.add(leavingSlideIndex)
    let maxHeight = 0
    for (const index of indices) {
      const s = post.slides[index]
      if (!s) continue
      maxHeight = Math.max(
        maxHeight,
        measureSlideTextHeight(
          s.subtitle,
          s.content,
          contentWidth,
          subtitleTypography,
          bodyTypography,
        ),
      )
    }
    return maxHeight > 0 ? `${maxHeight}px` : undefined
  }, [
    bodyTypography,
    contentWidth,
    leavingSlideIndex,
    post,
    slideIndex,
    subtitleTypography,
  ])

  if (!post || !slide) return null

  return (
    <section className="landing-stage" aria-live="polite" aria-atomic="true">
      <div className="landing-stage__viewport">
        <div
          className={clsx(
            'landing-stage__backdrop',
            prefadingSlideIndex !== null && leavingSlideIndex === null && 'is-bg-prefading',
            leavingSlideIndex !== null && 'is-bg-crossfading',
          )}
          style={{
            ['--landing-fade-ms' as string]: `${settings.transition_ms}ms`,
            ['--landing-prefade-ms' as string]: `${fadeLeadMs}ms`,
          }}
        >
          {post.slides.map((s, i) => (
            <SlideLayer
              key={`${post.id}-${s.src}-${i}`}
              slide={s}
              active={i === slideIndex}
              leaving={i === leavingSlideIndex}
              transitionMs={settings.transition_ms}
              panDurationMs={settings.background_pan_duration_ms}
              pan={resolveSlidePan(panBySlide, initialPanBySlide, post.id, i)}
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

        <div className="landing-stage__content" ref={contentRef}>
          <div className="landing-stage__pretext-probe" ref={probeRef} aria-hidden="true">
            <span className="landing-stage__subtitle">Probe</span>
            <span className="landing-stage__body">Probe</span>
          </div>

          <p className="landing-stage__post-title">{post.title}</p>

          <div className="landing-stage__text-stack" style={{ minHeight: textStackMinHeight }}>
            {post.slides.map((s, i) => {
              const slideShowDownload = s.type === 'document'
              const slideShowLinks = slideShowDownload || Boolean(s.source_url)
              return (
                <SlideTextLayer
                  key={`${post.id}-text-${s.src}-${i}`}
                  slide={s}
                  active={i === slideIndex}
                  leaving={i === leavingSlideIndex}
                  transitionMs={settings.transition_ms}
                  contentWidth={contentWidth}
                  subtitleType={subtitleTypography}
                  bodyType={bodyTypography}
                  reducedMotion={reducedMotion}
                  showDownload={slideShowDownload}
                  showLinks={slideShowLinks}
                  downloadLabel={s.download_label ?? ui.download_link_label}
                  sourceLabel={s.source_label ?? ui.source_link_label}
                />
              )
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
            onClick={() => goToPost(i)}
          >
            {postTabLabel(p)}
          </button>
        ))}
      </div>
    </section>
  )
}