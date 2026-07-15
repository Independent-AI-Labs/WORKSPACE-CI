import type { LandingPost } from '@/lib/landing-posts'

export type SlidePosition = { postIndex: number; slideIndex: number }

export type TransitionDirection = 1 | -1

export function slideOrdinal(posts: LandingPost[], position: SlidePosition): number {
  let ordinal = 0
  for (let postIndex = 0; postIndex < position.postIndex; postIndex++) {
    ordinal += posts[postIndex]?.slides.length ?? 0
  }
  return ordinal + position.slideIndex
}

export function totalSlideCount(posts: LandingPost[]): number {
  return posts.reduce((sum, post) => sum + post.slides.length, 0)
}

export function getTransitionDirection(
  posts: LandingPost[],
  outgoing: SlidePosition,
  incoming: SlidePosition,
): TransitionDirection {
  const total = totalSlideCount(posts)
  if (total <= 1) return 1

  const outOrd = slideOrdinal(posts, outgoing)
  const inOrd = slideOrdinal(posts, incoming)
  if (inOrd === outOrd) return 1

  let delta = inOrd - outOrd
  if (delta > total / 2) delta -= total
  if (delta < -total / 2) delta += total

  return delta >= 0 ? 1 : -1
}