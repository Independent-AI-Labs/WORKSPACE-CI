export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 4
export const ZOOM_STEP = 0.2
export const ZOOM_WHEEL_STEP = 0.0015
export const PNG_EXPORT_BASE_SCALE = 2

export function exportScaleForZoom(zoom: number): number {
  return PNG_EXPORT_BASE_SCALE * Math.max(1, zoom)
}

/** Resolution of the content displayed at zoom scale 1, expressed in user units. */
export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function clampZoom(scale: number): number {
  return clamp(scale, ZOOM_MIN, ZOOM_MAX)
}

/** Returns the on-screen zoom scale implied by `vb` relative to `base`. */
export function viewBoxScale(vb: ViewBox, base: ViewBox): number {
  if (vb.w <= 0) return 1
  return base.w / vb.w
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function parseViewBox(attr: string | null): ViewBox | null {
  if (!attr) return null
  const parts = attr.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  const [x, y, w, h] = parts
  if (!(w > 0 && h > 0)) return null
  return { x, y, w, h }
}

export function formatViewBox(vb: ViewBox): string {
  return `${round2(vb.x)} ${round2(vb.y)} ${round2(vb.w)} ${round2(vb.h)}`
}

export function applyViewBox(svg: SVGSVGElement, vb: ViewBox): void {
  svg.setAttribute('viewBox', formatViewBox(vb))
}

/**
 * CSS-displayed size of an SVG, with a cascade of fallbacks: the box model,
 * the width/height attributes, the (live) viewBox attribute, and finally a
 * sane default. Robust across jsdom (which reports 0 for the box model).
 */
export function getSvgCssSize(svg: SVGSVGElement): { w: number; h: number } {
  const rect = svg.getBoundingClientRect()
  if (rect.width > 0) return { w: rect.width, h: rect.height }
  const widthAttr = svg.getAttribute('width')
  const heightAttr = svg.getAttribute('height')
  const wFromAttr = widthAttr ? parseFloat(widthAttr) : 0
  const hFromAttr = heightAttr ? parseFloat(heightAttr) : 0
  if (wFromAttr > 0 && hFromAttr > 0) return { w: wFromAttr, h: hFromAttr }
  const vbParsed = parseViewBox(svg.getAttribute('viewBox'))
  if (vbParsed) return { w: vbParsed.w, h: vbParsed.h }
  const vbBase = svg.viewBox?.baseVal
  if (
    vbBase &&
    !Number.isNaN(vbBase.width) &&
    vbBase.width > 0 &&
    !Number.isNaN(vbBase.height) &&
    vbBase.height > 0
  ) {
    return { w: vbBase.width, h: vbBase.height }
  }
  return { w: 800, h: 600 }
}

/** The viewBox that represents the "whole diagram" reference frame. */
export function deriveBaseViewBox(svg: SVGSVGElement): ViewBox {
  const existing = parseViewBox(svg.getAttribute('viewBox'))
  if (existing) return existing
  const { w, h } = getSvgCssSize(svg)
  if (w > 0 && h > 0) return { x: 0, y: 0, w, h }
  return { x: 0, y: 0, w: 800, h: 600 }
}

/**
 * Zoom anchored at a pivot expressed in the SVG's *local* CSS coordinate space
 * (i.e. relative to the SVG's own bounding box, not the document or the
 * scroll container). Returns the new viewBox; never mutates inputs.
 *
 * `factor > 1` zooms in (content gets larger on-screen); `factor < 1` zooms out.
 * The resulting scale is clamped to `[ZOOM_MIN, ZOOM_MAX]` relative to `base`.
 */
export function zoomAtPoint(
  vb: ViewBox,
  base: ViewBox,
  pivotLocalCssX: number,
  pivotLocalCssY: number,
  cssW: number,
  cssH: number,
  factor: number,
): ViewBox {
  if (cssW <= 0 || cssH <= 0 || vb.w <= 0 || vb.h <= 0) return vb
  const px = (pivotLocalCssX / cssW) * vb.w + vb.x
  const py = (pivotLocalCssY / cssH) * vb.h + vb.y
  const oldScale = viewBoxScale(vb, base)
  const newScale = clampZoom(oldScale * factor)
  const newW = newScale === 0 ? vb.w : base.w / newScale
  const ratio = newW / vb.w
  const newH = vb.h * ratio
  const newX = px - (px - vb.x) * ratio
  const newY = py - (py - vb.y) * ratio
  return { x: newX, y: newY, w: newW, h: newH }
}

/** Convenience for the common "zoom around the center of the viewport" case. */
export function zoomAtCenter(
  vb: ViewBox,
  base: ViewBox,
  cssW: number,
  cssH: number,
  factor: number,
): ViewBox {
  return zoomAtPoint(vb, base, cssW / 2, cssH / 2, cssW, cssH, factor)
}

/**
 * Pan by `dxCss,dyCss` device pixels. Returns a new viewBox; never mutates.
 * Rightward/drag-down in screen pixels translates the viewBox *origin* left
 * and up so the dragged content follows the cursor.
 */
export function panBy(
  vb: ViewBox,
  dxCss: number,
  dyCss: number,
  cssW: number,
  cssH: number,
): ViewBox {
  const dxVb = cssW > 0 ? (dxCss * vb.w) / cssW : 0
  const dyVb = cssH > 0 ? (dyCss * vb.h) / cssH : 0
  return { x: vb.x - dxVb, y: vb.y - dyVb, w: vb.w, h: vb.h }
}

/**
 * Clamp the viewBox origin when zoomed in so whitespace outside the base
 * diagram region is never exposed. When zoomed out (vb wider/taller than base)
 * the origin is left untouched so zoomAtCenter / zoomAtPoint can keep the
 * diagram centered or anchored at the pivot instead of snapping top-left.
 */
export function clampOriginToBase(vb: ViewBox, base: ViewBox): ViewBox {
  if (vb.w >= base.w && vb.h >= base.h) return vb
  const x = vb.w >= base.w ? vb.x : clamp(vb.x, base.x, base.x + base.w - vb.w)
  const y = vb.h >= base.h ? vb.y : clamp(vb.y, base.y, base.y + base.h - vb.h)
  return { x, y, w: vb.w, h: vb.h }
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  return new XMLSerializer().serializeToString(clone)
}

export interface SvgExportOptions {
  scale?: number
  background?: string
}

/** Serialises a clone of `svg` with its viewBox reset to `base` so the PNG
 *  always captures the entire diagram, regardless of the live zoom/pan state. */
export async function svgToPngDataUrl(
  svg: SVGSVGElement,
  options: SvgExportOptions = {},
): Promise<string> {
  const scale = options.scale ?? PNG_EXPORT_BASE_SCALE
  const background = options.background ?? 'transparent'
  const base = deriveBaseViewBox(svg)
  const width = base.w
  const height = base.h

  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  clone.setAttribute('viewBox', formatViewBox(base))
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const svgString = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    if (background !== 'transparent') {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('failed to load svg image'))
    img.src = url
  })
}

/** Serialises a clone of `svg` with its viewBox reset to the diagram base,
 *  for SVG downloads that always capture the whole diagram. */
export function serializeSvgForExport(svg: SVGSVGElement): string {
  const base = deriveBaseViewBox(svg)
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  clone.setAttribute('viewBox', formatViewBox(base))
  clone.setAttribute('width', String(base.w))
  clone.setAttribute('height', String(base.h))
  return new XMLSerializer().serializeToString(clone)
}

export function downloadBlob(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  downloadBlob(dataUrl, filename)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('clipboard write failed:', err)
    return false
  }
}

/** Reads a CSS custom property from :root; empty string if unavailable. */
export function readCssVar(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}