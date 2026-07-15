import { describe, it, expect } from 'vitest'
import type { LandingPost } from '@/lib/landing-posts'
import {
  getTransitionDirection,
  slideOrdinal,
  totalSlideCount,
} from '@/lib/landing-slide-transition'

const posts: LandingPost[] = [
  {
    id: 'a',
    title: 'A',
    slides: [{ type: 'image', src: '/a1.jpg', subtitle: 'A1', content: '' }, { type: 'image', src: '/a2.jpg', subtitle: 'A2', content: '' }],
  },
  {
    id: 'b',
    title: 'B',
    slides: [{ type: 'image', src: '/b1.jpg', subtitle: 'B1', content: '' }],
  },
]

describe('landing-slide-transition', () => {
  it('counts slide ordinals across posts', () => {
    expect(totalSlideCount(posts)).toBe(3)
    expect(slideOrdinal(posts, { postIndex: 0, slideIndex: 1 })).toBe(1)
    expect(slideOrdinal(posts, { postIndex: 1, slideIndex: 0 })).toBe(2)
  })

  it('uses forward direction when advancing', () => {
    expect(
      getTransitionDirection(
        posts,
        { postIndex: 0, slideIndex: 0 },
        { postIndex: 0, slideIndex: 1 },
      ),
    ).toBe(1)
  })

  it('uses backward direction when rewinding', () => {
    expect(
      getTransitionDirection(
        posts,
        { postIndex: 0, slideIndex: 1 },
        { postIndex: 0, slideIndex: 0 },
      ),
    ).toBe(-1)
  })

  it('treats wrap-around next as forward', () => {
    expect(
      getTransitionDirection(
        posts,
        { postIndex: 1, slideIndex: 0 },
        { postIndex: 0, slideIndex: 0 },
      ),
    ).toBe(1)
  })

  it('treats wrap-around previous as backward', () => {
    expect(
      getTransitionDirection(
        posts,
        { postIndex: 0, slideIndex: 0 },
        { postIndex: 1, slideIndex: 0 },
      ),
    ).toBe(-1)
  })
})