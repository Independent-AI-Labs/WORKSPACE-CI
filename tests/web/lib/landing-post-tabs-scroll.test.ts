import { describe, it, expect } from 'vitest'
import {
  getHorizontalScrollOverflow,
  getHorizontalScrollStep,
  getPostTabIndicatorRect,
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

describe('getPostTabIndicatorRect', () => {
  it('uses scroll offsets so the indicator tracks tabs inside overflow', () => {
    const list = {
      scrollLeft: 80,
      scrollTop: 0,
      getBoundingClientRect: () => ({ left: 40, top: 100, width: 200, height: 48 }),
    } as unknown as HTMLElement

    const tab = {
      getBoundingClientRect: () => ({ left: 90, top: 108, width: 72, height: 32 }),
    } as unknown as HTMLElement

    expect(getPostTabIndicatorRect(list, tab)).toEqual({
      x: 130,
      y: 8,
      w: 72,
      h: 32,
    })
  })

  it('matches visible offset when scroll origin is zero', () => {
    const list = {
      scrollLeft: 0,
      scrollTop: 0,
      getBoundingClientRect: () => ({ left: 40, top: 100, width: 200, height: 48 }),
    } as unknown as HTMLElement

    const tab = {
      getBoundingClientRect: () => ({ left: 56, top: 108, width: 72, height: 32 }),
    } as unknown as HTMLElement

    expect(getPostTabIndicatorRect(list, tab)).toEqual({
      x: 16,
      y: 8,
      w: 72,
      h: 32,
    })
  })
})

describe('getHorizontalScrollStep', () => {
  it('uses a fraction of the viewport with a minimum step', () => {
    expect(getHorizontalScrollStep(100)).toBe(120)
    expect(getHorizontalScrollStep(300)).toBe(180)
  })
})