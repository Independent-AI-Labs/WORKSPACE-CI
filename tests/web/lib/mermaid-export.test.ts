import { describe, it, expect } from 'vitest'
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  PNG_EXPORT_BASE_SCALE,
  exportScaleForZoom,
  clamp,
  clampZoom,
  applyTransform,
  serializeSvg,
  IDENTITY_TRANSFORM,
} from '@/lib/mermaid-export'

describe('clamp', () => {
  it('clamps within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('clampZoom', () => {
  it('clamps to zoom range', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(0)).toBe(ZOOM_MIN)
    expect(clampZoom(100)).toBe(ZOOM_MAX)
  })

  it('respects the configured bounds', () => {
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN)
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX)
  })
})

describe('applyTransform', () => {
  it('writes transform string and origin', () => {
    const el = { style: {} as Record<string, string> } as unknown as SVGGraphicsElement
    applyTransform(el, { scale: 2, tx: 10, ty: -5 })
    expect(el.style.transform).toBe('translate(10px, -5px) scale(2)')
    expect(el.style.transformOrigin).toBe('0 0')
  })

  it('identity transform resets to 1', () => {
    const el = { style: {} as Record<string, string> } as unknown as SVGGraphicsElement
    applyTransform(el, IDENTITY_TRANSFORM)
    expect(el.style.transform).toBe('translate(0px, 0px) scale(1)')
  })
})

describe('serializeSvg', () => {
  it('serializes an svg and ensures xmlns', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '10')
    const out = serializeSvg(svg)
    expect(out).toContain('<svg')
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('preserves an existing xmlns without injecting a second attribute', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const out = serializeSvg(svg)
    expect(out).toContain('xmlns=')
    expect(out).toContain('<svg')
  })
})

describe('ZOOM_STEP', () => {
  it('is a positive fraction', () => {
    expect(ZOOM_STEP).toBeGreaterThan(0)
    expect(ZOOM_STEP).toBeLessThan(1)
  })
})

describe('exportScaleForZoom', () => {
  it('returns base scale at zoom 1', () => {
    expect(exportScaleForZoom(1)).toBe(PNG_EXPORT_BASE_SCALE)
  })

  it('scales linearly with zoom above 1', () => {
    expect(exportScaleForZoom(2)).toBe(PNG_EXPORT_BASE_SCALE * 2)
    expect(exportScaleForZoom(3)).toBe(PNG_EXPORT_BASE_SCALE * 3)
  })

  it('does not go below base scale for zoomed-out views', () => {
    expect(exportScaleForZoom(0.5)).toBe(PNG_EXPORT_BASE_SCALE)
  })
})
