import { describe, expect, it, vi } from 'vitest'
import {
  assignPanAxisForSlide,
  buildInitialPanMap,
  panMotionStyle,
  resolveSlidePan,
} from '@/lib/landing-pan'
import type { LandingPost } from '@/lib/landing-posts'

const posts: LandingPost[] = [
  {
    id: 'clankers',
    title: 'Test',
    slides: [
      {
        type: 'image',
        src: '/landing/clankers/grok-bad.png',
        subtitle: 'One',
        content: 'Body',
      },
      {
        type: 'document',
        src: '/landing/sovereignty/gdpr.pdf',
        subtitle: 'Two',
        content: 'Body',
      },
    ],
  },
]

describe('buildInitialPanMap', () => {
  it('assigns stable seeded origins within 30-70%', () => {
    const a = buildInitialPanMap(posts)
    const b = buildInitialPanMap(posts)
    expect(a).toEqual(b)
    expect(a['clankers-0'].origin.x).toBeGreaterThanOrEqual(30)
    expect(a['clankers-0'].origin.x).toBeLessThanOrEqual(70)
    expect(a['clankers-0'].origin.y).toBeGreaterThanOrEqual(30)
    expect(a['clankers-0'].origin.y).toBeLessThanOrEqual(70)
  })
})

describe('assignPanAxisForSlide', () => {
  it('rolls a new origin and bumps token', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)

    const initial = buildInitialPanMap(posts)
    const next = assignPanAxisForSlide(initial, 'clankers', 0, initial['clankers-0'])

    expect(next['clankers-0'].token).toBe(2)
    expect(next['clankers-0'].origin).toEqual({ x: 66, y: 66 })
    expect(Math.abs(next['clankers-0'].axis.x)).toBe(1)
    expect(Math.abs(next['clankers-0'].axis.y)).toBe(1)

    vi.restoreAllMocks()
  })
})

describe('panMotionStyle', () => {
  it('emits axis and origin CSS variables', () => {
    const pan = resolveSlidePan({}, buildInitialPanMap(posts), 'clankers', 0)
    expect(panMotionStyle(pan)).toMatchObject({
      '--pan-x': expect.stringMatching(/^-?1$/),
      '--pan-y': expect.stringMatching(/^-?1$/),
      '--pan-origin-x': expect.stringMatching(/^\d+(\.\d+)?%$/),
      '--pan-origin-y': expect.stringMatching(/^\d+(\.\d+)?%$/),
    })
  })
})