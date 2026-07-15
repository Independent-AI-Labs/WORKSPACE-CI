import { describe, expect, it } from 'vitest'
import { normalizeWindowPointer, parallaxOffset } from '@/lib/landing-pan-parallax'

describe('normalizeWindowPointer', () => {
  it('returns 0,0 at window center', () => {
    expect(normalizeWindowPointer(500, 400, 1000, 800)).toEqual({ x: 0, y: 0 })
  })

  it('returns -1,-1 at top-left', () => {
    expect(normalizeWindowPointer(0, 0, 1000, 800)).toEqual({ x: -1, y: -1 })
  })

  it('returns 1,1 at bottom-right', () => {
    expect(normalizeWindowPointer(1000, 800, 1000, 800)).toEqual({ x: 1, y: 1 })
  })
})

describe('parallaxOffset', () => {
  it('scales normalized pointer by max px', () => {
    expect(parallaxOffset({ x: 1, y: -0.5 }, { x: 4, y: 3 })).toEqual({ x: -4, y: 1.5 })
  })
})