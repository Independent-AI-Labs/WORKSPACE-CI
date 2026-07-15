'use client'

import { useMemo } from 'react'
import clsx from 'clsx'
import type { LandingPost, LandingSettings, LandingUi } from '@/lib/landing-posts'
import { formatSlideTabLabel } from '@/hooks/useRotatingPostsController'
import type { useRotatingPostsController } from '@/hooks/useRotatingPostsController'
import { LandingPostTabs } from '@/components/wiki/LandingPostTabs'
import { LandingStackedSlideMedia } from '@/components/wiki/LandingStackedSlideMedia'
import { SlideTextLayer } from '@/components/wiki/SlideTextLayer'

type Controller = ReturnType<typeof useRotatingPostsController>

interface LandingStageStackedProps {
  posts: LandingPost[]
  settings: LandingSettings
  ui: LandingUi
  controller: Controller
}

export function LandingStageStacked({
  posts,
  settings,
  ui,
  controller,
}: LandingStageStackedProps) {
  const {
    reducedMotion,
    postIndex,
    slideIndex,
    post,
    slide,
    slideCount,
    handleNext,
    handlePrev,
    handlePostTab,
    goToSlide,
  } = controller

  const slideIndicators = useMemo(
    () =>
      post?.slides.map((s, i) => ({
        key: `${post.id}-${s.src}-${i}`,
        active: i === slideIndex,
      })) ?? [],
    [post, slideIndex],
  )

  if (!post || !slide) return null

  const slideShowDownload = slide.type === 'document'
  const slideShowLinks = slideShowDownload || Boolean(slide.source_url)

  return (
    <section
      className="landing-stage landing-stage--stacked"
      aria-live="polite"
      aria-atomic="true"
    >
      <LandingPostTabs
        posts={posts}
        postIndex={postIndex}
        ui={ui}
        reducedMotion={reducedMotion}
        onPostTab={handlePostTab}
      />

      <div className="landing-stage__copy-panel landing-stage__copy-panel--stacked landing-stage__copy-panel--stacked-head">
        <p className="landing-stage__post-title landing-stage__post-title--stacked">{post.title}</p>
      </div>

      <div className="landing-stage__slide-frame">
        <div className="landing-stage__media-card landing-stage__media-card--gesture">
          <LandingStackedSlideMedia slide={slide} />

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
        </div>

        <div
          className="landing-stage__indicators landing-stage__stacked-indicators"
          role="group"
          aria-label={ui.carousel_aria_label}
        >
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

      <div className="landing-stage__copy-panel landing-stage__copy-panel--stacked landing-stage__copy-panel--stacked-tail">
        <SlideTextLayer
          slide={slide}
          active
          leaving={false}
          transitionMs={settings.transition_ms}
          subtitleType={{ font: '700 1.25rem Montserrat', lineHeightPx: 32 }}
          bodyType={{ font: '400 1rem Montserrat', lineHeightPx: 26 }}
          reducedMotion={reducedMotion}
          showDownload={slideShowDownload}
          showLinks={slideShowLinks}
          downloadLabel={slide.download_label ?? ui.download_link_label}
          sourceLabel={slide.source_label ?? ui.source_link_label}
          layout="stacked"
        />
      </div>
    </section>
  )
}