'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'
import {
  getHorizontalScrollOverflow,
  getHorizontalScrollStep,
} from '@/lib/landing-post-tabs-scroll'
import type { LandingPost, LandingUi } from '@/lib/landing-posts'

type PostTabIndicatorRect = { x: number; y: number; w: number; h: number }

function formatPostTabLabel(template: string, label: string): string {
  return template.replace('{label}', label)
}

function postTabLabel(post: LandingPost): string {
  return post.tab_label ?? post.title
}

interface LandingPostTabsProps {
  posts: LandingPost[]
  postIndex: number
  ui: LandingUi
  reducedMotion: boolean
  onPostTab: (index: number) => void
}

export function LandingPostTabs({
  posts,
  postIndex,
  ui,
  reducedMotion,
  onPostTab,
}: LandingPostTabsProps) {
  const isNarrow = useNarrowViewport(768)
  const postTablistRef = useRef<HTMLDivElement>(null)
  const postTabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [postTabIndicator, setPostTabIndicator] = useState<PostTabIndicatorRect | null>(null)
  const [postTabIndicatorReady, setPostTabIndicatorReady] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const syncPostTabScrollHints = useCallback(() => {
    const list = postTablistRef.current
    if (!list) return

    const { canScrollLeft: left, canScrollRight: right } = getHorizontalScrollOverflow(
      list.scrollLeft,
      list.scrollWidth,
      list.clientWidth,
    )
    setCanScrollLeft(left)
    setCanScrollRight(right)
  }, [])

  const syncPostTabIndicator = useCallback(() => {
    const list = postTablistRef.current
    const tab = postTabRefs.current[postIndex]
    if (!list || !tab) return

    const listRect = list.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    setPostTabIndicator({
      x: tabRect.left - listRect.left,
      y: tabRect.top - listRect.top,
      w: tabRect.width,
      h: tabRect.height,
    })
    setPostTabIndicatorReady(true)
    syncPostTabScrollHints()
  }, [postIndex, syncPostTabScrollHints])

  const scrollPostTabs = useCallback(
    (direction: 'prev' | 'next') => {
      const list = postTablistRef.current
      if (!list) return

      const amount = getHorizontalScrollStep(list.clientWidth)
      list.scrollBy({
        left: direction === 'prev' ? -amount : amount,
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    },
    [reducedMotion],
  )

  useLayoutEffect(() => {
    syncPostTabIndicator()
  }, [syncPostTabIndicator, posts.length])

  useLayoutEffect(() => {
    const tab = postTabRefs.current[postIndex]
    if (!tab) return
    tab.scrollIntoView?.({
      inline: 'nearest',
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    syncPostTabIndicator()
  }, [postIndex, reducedMotion, syncPostTabIndicator])

  useLayoutEffect(() => {
    const list = postTablistRef.current
    if (!list) return

    const onScroll = () => syncPostTabIndicator()
    list.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', syncPostTabIndicator)

    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncPostTabIndicator)
      observer.observe(list)
      for (const tab of postTabRefs.current) {
        if (tab) observer.observe(tab)
      }
    }

    return () => {
      observer?.disconnect()
      list.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', syncPostTabIndicator)
    }
  }, [syncPostTabIndicator, posts.length])

  const showScrollPrev = isNarrow && canScrollLeft
  const showScrollNext = isNarrow && canScrollRight

  return (
    <div className="landing-stage__post-tabs-shell">
      {showScrollPrev && (
        <button
          type="button"
          className="landing-stage__post-tabs-scroll landing-stage__post-tabs-scroll--prev"
          aria-label={ui.post_tabs_scroll_prev_aria_label}
          onClick={() => scrollPostTabs('prev')}
        >
          <i className="ri-arrow-left-s-line" aria-hidden="true" />
        </button>
      )}
      <div
        ref={postTablistRef}
        className="landing-stage__post-tabs"
        role="tablist"
        aria-label={ui.posts_tablist_aria_label}
      >
        {postTabIndicator && (
          <span
            aria-hidden="true"
            className={clsx(
              'landing-stage__post-tab-indicator',
              postTabIndicatorReady && 'is-ready',
              reducedMotion && 'is-reduced-motion',
            )}
            style={{
              ['--tab-ind-x' as string]: `${postTabIndicator.x}px`,
              ['--tab-ind-y' as string]: `${postTabIndicator.y}px`,
              ['--tab-ind-w' as string]: `${postTabIndicator.w}px`,
              ['--tab-ind-h' as string]: `${postTabIndicator.h}px`,
            }}
          />
        )}
        {posts.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              postTabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={i === postIndex}
            aria-label={formatPostTabLabel(ui.post_tab_aria_label_template, postTabLabel(p))}
            className={clsx('landing-stage__post-tab', i === postIndex && 'is-active')}
            onClick={() => onPostTab(i)}
          >
            {postTabLabel(p)}
          </button>
        ))}
      </div>
      {showScrollNext && (
        <button
          type="button"
          className="landing-stage__post-tabs-scroll landing-stage__post-tabs-scroll--next"
          aria-label={ui.post_tabs_scroll_next_aria_label}
          onClick={() => scrollPostTabs('next')}
        >
          <i className="ri-arrow-right-s-line" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}