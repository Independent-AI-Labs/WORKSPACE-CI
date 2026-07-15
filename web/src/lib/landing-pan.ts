import type { LandingPost } from '@/lib/landing-posts'

export type PanAxis = { x: 1 | -1; y: 1 | -1 }

export type PanOrigin = { x: number; y: number }

export type SlidePan = { axis: PanAxis; origin: PanOrigin; token: number }

export const DEFAULT_PAN: SlidePan = {
  axis: { x: 1, y: 1 },
  origin: { x: 50, y: 50 },
  token: 0,
}

const ORIGIN_MIN = 30
const ORIGIN_MAX = 70

function randomPanAxis(): PanAxis {
  return {
    x: Math.random() < 0.5 ? 1 : -1,
    y: Math.random() < 0.5 ? 1 : -1,
  }
}

function randomPanOrigin(): PanOrigin {
  const span = ORIGIN_MAX - ORIGIN_MIN
  return {
    x: ORIGIN_MIN + Math.random() * span,
    y: ORIGIN_MIN + Math.random() * span,
  }
}

/** Stable per slide for SSR; must not use Math.random(). */
function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function seededPanAxis(postId: string, slideIndex: number, slideSrc: string): PanAxis {
  const hash = hashString(`${postId}:${slideIndex}:${slideSrc}`)
  return {
    x: hash % 2 === 0 ? 1 : -1,
    y: Math.floor(hash / 2) % 2 === 0 ? 1 : -1,
  }
}

function seededPanOrigin(postId: string, slideIndex: number, slideSrc: string): PanOrigin {
  const hash = hashString(`${postId}:${slideIndex}:${slideSrc}:origin`)
  const span = ORIGIN_MAX - ORIGIN_MIN
  return {
    x: ORIGIN_MIN + (hash % 1000) / 1000 * span,
    y: ORIGIN_MIN + (Math.floor(hash / 1000) % 1000) / 1000 * span,
  }
}

export function panMotionStyle(pan: SlidePan): Record<string, string> {
  return {
    ['--pan-x']: String(pan.axis.x),
    ['--pan-y']: String(pan.axis.y),
    ['--pan-origin-x']: `${pan.origin.x}%`,
    ['--pan-origin-y']: `${pan.origin.y}%`,
  }
}

export function panSlideKey(postId: string, slideIndex: number): string {
  return `${postId}-${slideIndex}`
}

export function assignPanAxisForSlide(
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
      origin: randomPanOrigin(),
      token: (prev[key]?.token ?? seed?.token ?? 0) + 1,
    },
  }
}

export function buildInitialPanMap(posts: LandingPost[]): Record<string, SlidePan> {
  const map: Record<string, SlidePan> = {}
  for (const p of posts) {
    for (let i = 0; i < p.slides.length; i++) {
      const slide = p.slides[i]
      map[panSlideKey(p.id, i)] = {
        axis: seededPanAxis(p.id, i, slide.src),
        origin: seededPanOrigin(p.id, i, slide.src),
        token: 1,
      }
    }
  }
  return map
}

export function resolveSlidePan(
  panBySlide: Record<string, SlidePan>,
  initialPanBySlide: Record<string, SlidePan>,
  postId: string,
  slideIndex: number,
): SlidePan {
  const key = panSlideKey(postId, slideIndex)
  return panBySlide[key] ?? initialPanBySlide[key] ?? DEFAULT_PAN
}