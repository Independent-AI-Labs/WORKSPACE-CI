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

function formatPostTabLabel(template: string, index: number, title: string): string {
  return template.replace('{n}', String(index + 1)).replace('{title}', title)
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

  const post = posts[postIndex]
  const slide = post?.slides[slideIndex]
  const slideCount = post?.slides.length ?? 0

  const advance = useCallback(() => {
    if (!post) return
    if (slideIndex < post.slides.length - 1) {
      setSlideIndex((i) => i + 1)
      return
    }
    setSlideIndex(0)
    setPostIndex((i) => (i + 1) % posts.length)
  }, [post, slideIndex, posts.length])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (reducedMotion || posts.length === 0) return
    const id = window.setInterval(advance, settings.slide_interval_ms)
    return () => window.clearInterval(id)
  }, [advance, reducedMotion, posts.length, settings.slide_interval_ms])

  const postIndicators = useMemo(
    () => posts.map((p, i) => ({ id: p.id, active: i === postIndex })),
    [posts, postIndex],
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

      <div className="landing-stage__indicators" role="tablist" aria-label={ui.carousel_aria_label}>
        {postIndicators.map((ind, i) => (
          <button
            key={ind.id}
            type="button"
            role="tab"
            aria-selected={ind.active}
            aria-label={formatPostTabLabel(ui.post_tab_aria_label_template, i, posts[i].title)}
            className={clsx('landing-stage__dot', ind.active && 'is-active')}
            onClick={() => {
              setPostIndex(i)
              setSlideIndex(0)
            }}
          />
        ))}
        <span className="landing-stage__slide-count" aria-hidden="true">
          {slideIndex + 1}/{slideCount}
        </span>
      </div>
    </section>
  )
}