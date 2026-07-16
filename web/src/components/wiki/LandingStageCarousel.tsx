'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { LandingPost, LandingSettings, LandingUi } from '@/lib/landing-posts'
import { normalizeWindowPointer, parallaxOffset } from '@/lib/landing-pan-parallax'
import {
  measureSlideTextHeight,
  measureTextColumnWidth,
  typographyFromComputed,
  type PretextTypography,
} from '@/lib/landing-pretext'
import { resolveSlidePan } from '@/lib/landing-pan'
import { formatSlideTabLabel } from '@/hooks/useRotatingPostsController'
import type { useRotatingPostsController } from '@/hooks/useRotatingPostsController'
import { LandingPostTabs } from '@/components/wiki/LandingPostTabs'
import { LandingSlideLayer } from '@/components/wiki/LandingSlideLayer'
import { SlideTextLayer } from '@/components/wiki/SlideTextLayer'

type Controller = ReturnType<typeof useRotatingPostsController>

interface LandingStageCarouselProps {
  posts: LandingPost[]
  settings: LandingSettings
  ui: LandingUi
  controller: Controller
}

export function LandingStageCarousel({
  posts,
  settings,
  ui,
  controller,
}: LandingStageCarouselProps) {
  const {
    activeSlide,
    leavingSlide,
    reducedMotion,
    panBySlide,
    prefadingSlideIndex,
    initialPanBySlide,
    fadeLeadMs,
    postIndex,
    slideIndex,
    post,
    slide,
    slideCount,
    crossPostLeaving,
    transitionDirection,
    handleNext,
    handlePrev,
    handlePostTab,
    goToSlide,
  } = controller

  const [textColumnWidth, setTextColumnWidth] = useState(0)
  const [subtitleType, setSubtitleType] = useState<PretextTypography | null>(null)
  const [bodyType, setBodyType] = useState<PretextTypography | null>(null)
  const copyPanelRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const resetParallax = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.style.setProperty('--landing-parallax-x', '0')
    viewport.style.setProperty('--landing-parallax-y', '0')
  }, [])

  useLayoutEffect(() => {
    const copyPanel = copyPanelRef.current
    const probe = probeRef.current
    if (!copyPanel || !probe) return

    const sync = () => {
      setTextColumnWidth(measureTextColumnWidth(copyPanel))
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
    observer.observe(copyPanel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      resetParallax()
      return
    }

    const onMove = (event: MouseEvent) => {
      const viewport = viewportRef.current
      if (!viewport) return
      const norm = normalizeWindowPointer(
        event.clientX,
        event.clientY,
        window.innerWidth,
        window.innerHeight,
      )
      const offset = parallaxOffset(norm)
      viewport.style.setProperty('--landing-parallax-x', String(offset.x))
      viewport.style.setProperty('--landing-parallax-y', String(offset.y))
    }

    const onLeave = () => resetParallax()

    window.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      resetParallax()
    }
  }, [reducedMotion, resetParallax])

  const renderedPostIndices = useMemo(() => posts.map((_, i) => i), [posts])

  const slideIndicators = useMemo(
    () =>
      post?.slides.map((s, i) => ({
        key: `${post.id}-${s.src}-${i}`,
        active: i === slideIndex,
      })) ?? [],
    [post, slideIndex],
  )

  const subtitleTypography = subtitleType ?? { font: '700 32px Montserrat', lineHeightPx: 40 }
  const bodyTypography = bodyType ?? { font: '400 22px Montserrat', lineHeightPx: 36 }

  const textStackHeight = useMemo(() => {
    if (textColumnWidth <= 0) return undefined
    let maxHeight = 0
    for (const p of posts) {
      for (const s of p.slides) {
        const linkCount = (s.type === 'document' ? 1 : 0) + (s.source_url ? 1 : 0)
        maxHeight = Math.max(
          maxHeight,
          measureSlideTextHeight(
            s.subtitle,
            s.content,
            textColumnWidth,
            subtitleTypography,
            bodyTypography,
            linkCount,
          ),
        )
      }
    }
    return maxHeight > 0 ? `${maxHeight}px` : undefined
  }, [bodyTypography, posts, subtitleTypography, textColumnWidth])

  if (!post || !slide) return null

  const leavingPostTitle =
    crossPostLeaving !== null ? posts[crossPostLeaving.postIndex]?.title : null

  return (
    <section className="landing-stage landing-stage--carousel" aria-live="polite" aria-atomic="true">
      <LandingPostTabs
        posts={posts}
        postIndex={postIndex}
        ui={ui}
        reducedMotion={reducedMotion}
        onPostTab={handlePostTab}
      />

      <div
        className="landing-stage__viewport"
        ref={viewportRef}
        style={{
          ['--landing-parallax-max-x' as string]: '4',
          ['--landing-parallax-max-y' as string]: '3',
        }}
      >
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

          <div className="landing-stage__content">
            <div className="landing-stage__copy-panel" ref={copyPanelRef}>
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
                style={textStackHeight ? { minHeight: textStackHeight } : undefined}
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
                      transitionMs={settings.text_transition_ms}
                      subtitleType={subtitleTypography}
                      bodyType={bodyTypography}
                      reducedMotion={reducedMotion}
                      showDownload={slideShowDownload}
                      showLinks={slideShowLinks}
                      downloadLabel={s.download_label ?? ui.download_link_label}
                      sourceLabel={s.source_label ?? ui.source_link_label}
                      solutionsLinkPrefix={ui.solutions_link_prefix}
                      resourcesLinkPrefix={ui.resources_link_prefix}
                      transitionDirection={transitionDirection}
                    />
                  )
                })
              })}
              </div>
            </div>
          </div>

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
      </div>
    </section>
  )
}