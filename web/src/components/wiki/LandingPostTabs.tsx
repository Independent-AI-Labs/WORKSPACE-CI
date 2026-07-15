'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
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
  const postTablistRef = useRef<HTMLDivElement>(null)
  const postTabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [postTabIndicator, setPostTabIndicator] = useState<PostTabIndicatorRect | null>(null)
  const [postTabIndicatorReady, setPostTabIndicatorReady] = useState(false)

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
  }, [postIndex])

  useLayoutEffect(() => {
    syncPostTabIndicator()
  }, [syncPostTabIndicator, posts.length])

  useLayoutEffect(() => {
    const list = postTablistRef.current
    if (!list || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(syncPostTabIndicator)
    observer.observe(list)
    for (const tab of postTabRefs.current) {
      if (tab) observer.observe(tab)
    }

    window.addEventListener('resize', syncPostTabIndicator)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncPostTabIndicator)
    }
  }, [syncPostTabIndicator, posts.length])

  return (
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
  )
}