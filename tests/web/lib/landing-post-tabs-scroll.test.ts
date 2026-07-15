import { describe, it, expect } from 'vitest'
import {
  getHorizontalScrollOverflow,
  getHorizontalScrollStep,
} from '@/lib/landing-post-tabs-scroll'

describe('getHorizontalScrollOverflow', () => {
  it('reports no overflow when content fits', () => {
    expect(getHorizontalScrollOverflow(0, 200, 200)).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    })
  })

  it('reports right overflow at scroll origin', () => {
    expect(getHorizontalScrollOverflow(0, 400, 200)).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    })
  })

  it('reports left overflow when scrolled away from start', () => {
    expect(getHorizontalScrollOverflow(120, 400, 200)).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    })
  })

  it('reports no right overflow when scrolled to end', () => {
    expect(getHorizontalScrollOverflow(200, 400, 200)).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    })
  })
})

describe('getHorizontalScrollStep', () => {
  it('uses a fraction of the viewport with a minimum step', () => {
    expect(getHorizontalScrollStep(100)).toBe(120)
    expect(getHorizontalScrollStep(300)).toBe(180)
  })
})