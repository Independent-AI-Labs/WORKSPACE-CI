export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 4
export const ZOOM_STEP = 0.2
export const ZOOM_WHEEL_STEP = 0.0015
export const PNG_EXPORT_BASE_SCALE = 2

export function exportScaleForZoom(zoom: number): number {
  return PNG_EXPORT_BASE_SCALE * Math.max(1, zoom)
}

export interface Transform {
  scale: number
  tx: number
  ty: number
}

export const IDENTITY_TRANSFORM: Transform = { scale: 1, tx: 0, ty: 0 }

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function clampZoom(scale: number): number {
  return clamp(scale, ZOOM_MIN, ZOOM_MAX)
}

export function applyTransform(el: SVGGraphicsElement, t: Transform): void {
  el.style.transform = `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`
  el.style.transformOrigin = '0 0'
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

export async function svgToPngDataUrl(
  svg: SVGSVGElement,
  options: SvgExportOptions = {},
): Promise<string> {
  const scale = options.scale ?? PNG_EXPORT_BASE_SCALE
  const background = options.background ?? 'transparent'
  const width = svg.clientWidth || svg.viewBox.baseVal.width || 800
  const height = svg.clientHeight || svg.viewBox.baseVal.height || 600

  const svgString = serializeSvg(svg)
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
