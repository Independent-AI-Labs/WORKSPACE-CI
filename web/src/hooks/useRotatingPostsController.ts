'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LandingPost, LandingSettings } from '@/lib/landing-posts'
import {
  assignPanAxisForSlide,
  buildInitialPanMap,
  panSlideKey,
  type SlidePan,
} from '@/lib/landing-pan'
import {
  getTransitionDirection,
  type SlidePosition,
  type TransitionDirection,
} from '@/lib/landing-slide-transition'

export type { SlidePosition }

function sameSlidePosition(a: SlidePosition, b: SlidePosition): boolean {
  return a.postIndex === b.postIndex && a.slideIndex === b.slideIndex
}

export function formatSlideTabLabel(template: string, index: number, total: number): string {
  return template.replace('{n}', String(index + 1)).replace('{total}', String(total))
}

export function useRotatingPostsController(posts: LandingPost[], settings: LandingSettings) {
  const [activeSlide, setActiveSlide] = useState<SlidePosition>({ postIndex: 0, slideIndex: 0 })
  const [leavingSlide, setLeavingSlide] = useState<SlidePosition | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [timerEpoch, setTimerEpoch] = useState(0)
  const [panBySlide, setPanBySlide] = useState<Record<string, SlidePan>>({})
  const [prefadingSlideIndex, setPrefadingSlideIndex] = useState<number | null>(null)
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>(1)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSlideRef = useRef(activeSlide)

  const initialPanBySlide = useMemo(() => buildInitialPanMap(posts), [posts])
  const fadeLeadMs = Math.min(900, Math.max(400, Math.floor(settings.transition_ms * 0.65)))

  useEffect(() => {
    activeSlideRef.current = activeSlide
  }, [activeSlide])

  const postIndex = activeSlide.postIndex
  const slideIndex = activeSlide.slideIndex
  const post = posts[postIndex]
  const slide = post?.slides[slideIndex]
  const slideCount = post?.slides.length ?? 0

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

      setTransitionDirection(getTransitionDirection(posts, outgoing, incoming))
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

  return {
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
  }
}