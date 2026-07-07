import {
  IDENTITY_TRANSFORM,
  ZOOM_STEP,
  ZOOM_WHEEL_STEP,
  exportScaleForZoom,
  applyTransform,
  clampZoom,
  downloadBlob,
  downloadDataUrl,
  serializeSvg,
  svgToPngDataUrl,
  type Transform,
} from '@/lib/mermaid-export'

export interface ToolbarAction {
  action: string
  icon: string
  label: string
  group?: string
}

export interface PanState {
  startX: number
  startY: number
  originTx: number
  originTy: number
  pointerId: number
}

export function readCssVar(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function createButton(action: ToolbarAction): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'mermaid-btn'
  btn.dataset.action = action.action
  btn.setAttribute('aria-label', action.label)
  btn.title = action.label
  const icon = document.createElement('i')
  icon.className = action.icon
  icon.setAttribute('aria-hidden', 'true')
  btn.appendChild(icon)
  return btn
}

export class FullscreenOverlay {
  private readonly overlay: HTMLDivElement
  private readonly stage: HTMLDivElement
  private readonly svg: SVGSVGElement
  private transform: Transform
  private pan: PanState | null = null
  private readonly cleanups: Array<() => void> = []

  constructor(svg: SVGSVGElement) {
    this.svg = svg
    this.transform = { ...IDENTITY_TRANSFORM }
    this.overlay = document.createElement('div')
    this.overlay.className = 'mermaid-fullscreen'
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-modal', 'true')
    this.overlay.setAttribute('aria-label', 'Fullscreen diagram view')

    const toolbar = document.createElement('div')
    toolbar.className = 'mermaid-toolbar mermaid-toolbar--overlay'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', 'Fullscreen diagram controls')
    const actions: ToolbarAction[] = [
      { action: 'zoom-in', icon: 'ri-zoom-in-line', label: 'Zoom in', group: 'zoom' },
      { action: 'zoom-out', icon: 'ri-zoom-out-line', label: 'Zoom out', group: 'zoom' },
      { action: 'reset', icon: 'ri-restart-line', label: 'Reset view', group: 'zoom' },
      { action: 'download-svg', icon: 'ri-download-2-line', label: 'Download SVG' },
      { action: 'download-png', icon: 'ri-image-line', label: 'Download PNG' },
      { action: 'close', icon: 'ri-close-line', label: 'Close fullscreen' },
    ]
    let lastGroup = ''
    for (const a of actions) {
      if (lastGroup && a.group !== lastGroup) {
        const sep = document.createElement('span')
        sep.className = 'mermaid-toolbar__sep'
        toolbar.appendChild(sep)
      }
      toolbar.appendChild(createButton(a))
      lastGroup = a.group ?? ''
    }

    this.stage = document.createElement('div')
    this.stage.className = 'mermaid-fullscreen__stage'
    this.stage.setAttribute('tabindex', '0')
    svg.style.display = 'block'
    applyTransform(svg, this.transform)
    this.stage.appendChild(svg)

    this.overlay.appendChild(toolbar)
    this.overlay.appendChild(this.stage)

    toolbar.addEventListener('click', this.onToolbarClick)
    this.stage.addEventListener('wheel', this.onWheel, { passive: false })
    this.stage.addEventListener('pointerdown', this.onPointerDown)
    this.stage.addEventListener('pointermove', this.onPointerMove)
    this.stage.addEventListener('pointerup', this.onPointerUp)
    this.stage.addEventListener('pointercancel', this.onPointerUp)
    this.overlay.addEventListener('click', this.onBackdropClick)

    this.cleanups.push(() => {
      toolbar.removeEventListener('click', this.onToolbarClick)
      this.stage.removeEventListener('wheel', this.onWheel)
      this.stage.removeEventListener('pointerdown', this.onPointerDown)
      this.stage.removeEventListener('pointermove', this.onPointerMove)
      this.stage.removeEventListener('pointerup', this.onPointerUp)
      this.stage.removeEventListener('pointercancel', this.onPointerUp)
      this.overlay.removeEventListener('click', this.onBackdropClick)
    })
  }

  mount(): void {
    document.body.appendChild(this.overlay)
    document.body.classList.add('is-mermaid-fullscreen')
    this.stage.focus()
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups.length = 0
    this.overlay.remove()
    document.body.classList.remove('is-mermaid-fullscreen')
  }

  syncTransform(t: Transform): void {
    this.transform = { ...t }
    applyTransform(this.svg, this.transform)
  }

  private setTransform(t: Transform): void {
    this.transform = t
    applyTransform(this.svg, t)
  }

  private zoomAroundCenter(factor: number): void {
    const rect = this.stage.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const px = (cx - this.transform.tx) / this.transform.scale
    const py = (cy - this.transform.ty) / this.transform.scale
    const nextScale = clampZoom(this.transform.scale * factor)
    this.setTransform({
      scale: nextScale,
      tx: cx - px * nextScale,
      ty: cy - py * nextScale,
    })
  }

  private onToolbarClick = (e: Event): void => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.mermaid-btn')
    if (!target) return
    switch (target.dataset.action) {
      case 'zoom-in':
        this.zoomAroundCenter(1 + ZOOM_STEP)
        break
      case 'zoom-out':
        this.zoomAroundCenter(1 - ZOOM_STEP)
        break
      case 'reset':
        this.setTransform({ ...IDENTITY_TRANSFORM })
        break
      case 'download-svg': {
        const xml = serializeSvg(this.svg)
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        downloadBlob(url, 'mermaid-diagram.svg')
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        break
      }
      case 'download-png': {
        void this.downloadPng()
        break
      }
      case 'close':
        this.destroy()
        break
    }
  }

  private async downloadPng(): Promise<void> {
    try {
      const dataUrl = await svgToPngDataUrl(this.svg, {
        scale: exportScaleForZoom(this.transform.scale),
        background: readCssVar('--bg') || '#181818',
      })
      downloadDataUrl(dataUrl, 'mermaid-diagram.png')
    } catch (err) {
      console.error('mermaid png export failed:', err)
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    this.zoomAroundCenter(Math.exp(-e.deltaY * ZOOM_WHEEL_STEP))
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    this.pan = {
      startX: e.clientX,
      startY: e.clientY,
      originTx: this.transform.tx,
      originTy: this.transform.ty,
      pointerId: e.pointerId,
    }
    this.stage.setPointerCapture(e.pointerId)
    this.stage.classList.add('is-grabbing')
    document.body.classList.add('is-mermaid-dragging')
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pan) return
    this.setTransform({
      scale: this.transform.scale,
      tx: this.pan.originTx + (e.clientX - this.pan.startX),
      ty: this.pan.originTy + (e.clientY - this.pan.startY),
    })
  }

  private onPointerUp = (): void => {
    if (!this.pan) return
    try {
      this.stage.releasePointerCapture(this.pan.pointerId)
    } catch (err) {
      console.debug('pointer capture already released:', err)
    }
    this.pan = null
    this.stage.classList.remove('is-grabbing')
    document.body.classList.remove('is-mermaid-dragging')
  }

  private onBackdropClick = (e: MouseEvent): void => {
    if (e.target === this.overlay) this.destroy()
  }
}
