import { describe, it, expect } from 'vitest'
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  PNG_EXPORT_BASE_SCALE,
  exportScaleForZoom,
  clamp,
  clampZoom,
  clampOriginToBase,
  parseViewBox,
  formatViewBox,
  applyViewBox,
  deriveBaseViewBox,
  getSvgCssSize,
  viewBoxScale,
  zoomAtPoint,
  zoomAtCenter,
  panBy,
  serializeSvg,
  type ViewBox,
} from '@/lib/mermaid-export'

const BASE: ViewBox = { x: 0, y: 0, w: 100, h: 50 }

function makeSvg(viewBox?: string, width?: string, height?: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  if (viewBox) svg.setAttribute('viewBox', viewBox)
  if (width) svg.setAttribute('width', width)
  if (height) svg.setAttribute('height', height)
  return svg
}

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

describe('parseViewBox', () => {
  it('parses a well-formed viewBox attribute', () => {
    expect(parseViewBox('0 0 100 50')).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    expect(parseViewBox(' -1 -2  300 400 ')).toEqual({ x: -1, y: -2, w: 300, h: 400 })
    expect(parseViewBox('10,20,30,40')).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('returns null for malformed input', () => {
    expect(parseViewBox(null)).toBeNull()
    expect(parseViewBox('')).toBeNull()
    expect(parseViewBox('1 2 3')).toBeNull()
    expect(parseViewBox('a b c d')).toBeNull()
    expect(parseViewBox('0 0 0 50')).toBeNull()
    expect(parseViewBox('0 0 100 0')).toBeNull()
  })
})

describe('formatViewBox', () => {
  it('rounds to two decimals and joins with spaces', () => {
    // 1.005 cannot be represented exactly in IEEE-754 (it is stored as
    // ~1.0049999999999), so Math.round(1.005 * 100) yields 100, not 101.
    // The test documents the real FP rounding behaviour of round2.
    expect(formatViewBox({ x: 0.123456, y: 1.005, w: 100, h: 50 })).toBe(
      '0.12 1 100 50',
    )
    expect(formatViewBox(BASE)).toBe('0 0 100 50')
  })
})

describe('applyViewBox', () => {
  it('writes a formatted viewBox attribute', () => {
    const svg = makeSvg(undefined, '100', '50')
    applyViewBox(svg, { x: -10, y: 5, w: 200, h: 100 })
    expect(svg.getAttribute('viewBox')).toBe('-10 5 200 100')
  })
})

describe('viewBoxScale', () => {
  it('returns base.w / vb.w', () => {
    expect(viewBoxScale({ x: 0, y: 0, w: 100, h: 50 }, BASE)).toBe(1)
    expect(viewBoxScale({ x: 0, y: 0, w: 50, h: 25 }, BASE)).toBe(2)
    expect(viewBoxScale({ x: 0, y: 0, w: 200, h: 100 }, BASE)).toBe(0.5)
  })

  it('returns 1 for a degenerate viewBox', () => {
    expect(viewBoxScale({ x: 0, y: 0, w: 0, h: 0 }, BASE)).toBe(1)
  })
})

describe('deriveBaseViewBox', () => {
  it('prefers an existing viewBox attribute', () => {
    expect(deriveBaseViewBox(makeSvg('-5 -5 800 400'))).toEqual({
      x: -5,
      y: -5,
      w: 800,
      h: 400,
    })
  })

  it('synthesises from width/height when no viewBox attribute is present', () => {
    expect(deriveBaseViewBox(makeSvg(undefined, '100', '50'))).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 50,
    })
  })

  it('falls back to a sane default when nothing is recoverable', () => {
    expect(deriveBaseViewBox(makeSvg())).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })
})

describe('getSvgCssSize', () => {
  it('falls back to width/height attributes when the box model is zero (jsdom)', () => {
    expect(getSvgCssSize(makeSvg(undefined, '100', '50'))).toEqual({ w: 100, h: 50 })
  })

  it('falls back to viewBox attribute when width/height are absent', () => {
    expect(getSvgCssSize(makeSvg('0 0 250 125'))).toEqual({ w: 250, h: 125 })
  })

  it('falls back to a default when nothing is recoverable', () => {
    expect(getSvgCssSize(makeSvg())).toEqual({ w: 800, h: 600 })
  })
})

describe('zoomAtPoint', () => {
  it('zooms in with factor 2 around the center pivot', () => {
    const next = zoomAtPoint(BASE, BASE, 50, 25, 100, 50, 2)
    // New scale = clampZoom(1 * 2) = 2 → newW = 100/2 = 50, newH = 25.
    expect(viewBoxScale(next, BASE)).toBe(2)
    expect(next.w).toBe(50)
    expect(next.h).toBe(25)
    // Center (50,25 in css; (50,25) in vb) stays fixed: pivot in vb is
    // (50/100)*100 + 0 = 50; new x = 50 - (50-0)*(50/100) = 50 - 25 = 25.
    expect(next.x).toBe(25)
    expect(next.y).toBe(12.5)
  })

  it('zooms in around the top-left corner anchor', () => {
    const next = zoomAtPoint(BASE, BASE, 0, 0, 100, 50, 2)
    // pivot in vb = (0/100)*100 = (0,0). newX = 0 - (0-0)*ratio = 0.
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
    expect(next.w).toBe(50)
    expect(next.h).toBe(25)
    expect(viewBoxScale(next, BASE)).toBe(2)
  })

  it('clamps the resulting scale to ZOOM_MAX from above', () => {
    // Start already at scale 2 (vbW = 50); zoom in by another factor of 4.
    const alreadyZoomed: ViewBox = { x: 25, y: 12.5, w: 50, h: 25 }
    const next = zoomAtPoint(alreadyZoomed, BASE, 25, 12.5, 100, 50, 4)
    expect(viewBoxScale(next, BASE)).toBe(ZOOM_MAX)
  })

  it('clamps the resulting scale to ZOOM_MIN from below', () => {
    const next = zoomAtPoint(BASE, BASE, 50, 25, 100, 50, 0.01)
    expect(viewBoxScale(next, BASE)).toBe(ZOOM_MIN)
  })

  it('returns the input unchanged when cssSize is degenerate', () => {
    expect(zoomAtPoint(BASE, BASE, 0, 0, 0, 0, 2)).toEqual(BASE)
  })

  it('preserves the aspect ratio of the original viewBox', () => {
    const next = zoomAtPoint(BASE, BASE, 50, 25, 100, 50, 2)
    expect(next.w / next.h).toBeCloseTo(BASE.w / BASE.h, 6)
  })
})

describe('zoomAtCenter', () => {
  it('zooms around the center of the css viewport', () => {
    const next = zoomAtCenter(BASE, BASE, 100, 50, 2)
    expect(viewBoxScale(next, BASE)).toBe(2)
    expect(next.x).toBe(25)
    expect(next.y).toBe(12.5)
  })

  it('stays centered after zoom-out when passed through clampOriginToBase', () => {
    const zoomedOut = zoomAtCenter(BASE, BASE, 100, 50, 0.8)
    const clamped = clampOriginToBase(zoomedOut, BASE)
    expect(clamped).toEqual(zoomedOut)
    expect(clamped.x).toBe(-12.5)
    expect(clamped.y).toBe(-6.25)
  })
})

describe('panBy', () => {
  it('translates the viewBox origin so drag content follows the cursor', () => {
    // Drag the content 100 css-px to the right (50 css-px down). Since
    // cssW=100 == vbW=100, the viewBox origin shifts left by 100 vbunits
    // (and up by 50).
    const next = panBy(BASE, 100, 50, 100, 50)
    expect(next).toEqual({ x: -100, y: -50, w: 100, h: 50 })
  })

  it('scales by the cssToVb ratio when vb and css sizes differ', () => {
    // vb is 200x100 user units displayed in 100x50 css-px → ratio = 2.
    const vb: ViewBox = { x: 0, y: 0, w: 200, h: 100 }
    const next = panBy(vb, 25, 12, 100, 50)
    expect(next.x).toBe(-50)
    expect(next.y).toBe(-24)
    expect(next.w).toBe(200)
    expect(next.h).toBe(100)
  })

  it('no-ops when cssSize is degenerate', () => {
    expect(panBy(BASE, 100, 50, 0, 0)).toEqual(BASE)
  })
})

describe('clampOriginToBase', () => {
  it('keeps the viewBox origin within the base region when zoomed in', () => {
    const zoomed: ViewBox = { x: 25, y: 12.5, w: 50, h: 25 }
    // Origin allowed range: [0, 100-50] = [0, 50] for x; [0, 50-25] = [0, 25]
    // for y. Push the origin past both ends and observe clamping.
    expect(clampOriginToBase({ ...zoomed, x: -10 }, BASE).x).toBe(0)
    expect(clampOriginToBase({ ...zoomed, x: 100 }, BASE).x).toBe(50)
    expect(clampOriginToBase({ ...zoomed, y: -10 }, BASE).y).toBe(0)
    expect(clampOriginToBase({ ...zoomed, y: 100 }, BASE).y).toBe(25)
  })

  it('preserves the origin when zoomed out so the diagram stays centered', () => {
    const wider: ViewBox = { x: -50, y: -25, w: 200, h: 100 }
    expect(clampOriginToBase(wider, BASE)).toEqual(wider)
  })
})

describe('serializeSvg', () => {
  it('serializes an svg and ensures xmlns', () => {
    const svg = makeSvg(undefined, '10')
    const out = serializeSvg(svg)
    expect(out).toContain('<svg')
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('preserves an existing xmlns without injecting a second attribute', () => {
    const svg = makeSvg()
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const out = serializeSvg(svg)
    expect(out).toContain('xmlns=')
    expect(out).toContain('<svg')
  })
})