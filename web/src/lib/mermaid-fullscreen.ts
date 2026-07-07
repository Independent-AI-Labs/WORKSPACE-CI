import {
  ZOOM_STEP,
  ZOOM_WHEEL_STEP,
  downloadBlob,
  downloadDataUrl,
exportScaleForZoom,
  applyViewBox,
  clampOriginToBase,
  getSvgCssSize,
  panBy,
  parseViewBox,
  readCssVar,
  serializeSvgForExport,
  svgToPngDataUrl,
  viewBoxScale,
  zoomAtCenter,
  zoomAtPoint,
  type ViewBox,
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
  originVb: ViewBox
  pointerId: number
}

// Re-export readCssVar so the mermaid-diagram module's existing imports from
// '@/lib/mermaid-fullscreen' keep working without churn.
export { readCssVar }

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
  private base: ViewBox
  private vb: ViewBox
  private pan: PanState | null = null
  private readonly cleanups: Array<() => void> = []

  constructor(svg: SVGSVGElement, sourceBase: ViewBox) {
    this.svg = svg
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
    // Strip any inline CSS transform inherited from the live renderer so the
    // viewBox is the sole source of truth.
    svg.style.transform = ''
    svg.style.transformOrigin = ''

    // If the cloned svg already has a parsed viewBox, derive base from it;
    // otherwise fall back to the source diagram's base.
    const live = parseViewBox(svg.getAttribute('viewBox'))
    this.base = live ? live : { ...sourceBase }
    this.vb = { ...this.base }
    applyViewBox(svg, this.vb)
    this.stage.appendChild(svg)

    this.overlay.appendChild(toolbar)
    this.overlay.appendChild(this.stage)

    this.cleanups.push(() => {
      toolbar.removeEventListener('click', this.onToolbarClick)
      this.stage.removeEventListener('wheel', this.onWheel)
      this.stage.removeEventListener('pointerdown', this.onPointerDown)
      this.stage.removeEventListener('pointermove', this.onPointerMove)
      this.stage.removeEventListener('pointerup', this.onPointerUp)
      this.stage.removeEventListener('pointercancel', this.onPointerUp)
      this.overlay.removeEventListener('click', this.onBackdropClick)
    })
    toolbar.addEventListener('click', this.onToolbarClick)
    this.stage.addEventListener('wheel', this.onWheel, { passive: false })
    this.stage.addEventListener('pointerdown', this.onPointerDown)
    this.stage.addEventListener('pointermove', this.onPointerMove)
    this.stage.addEventListener('pointerup', this.onPointerUp)
    this.stage.addEventListener('pointercancel', this.onPointerUp)
    this.overlay.addEventListener('click', this.onBackdropClick)
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

  // ------------------------------------------------------------------
  private setViewBox(next: ViewBox): void {
    this.vb = next
    applyViewBox(this.svg, this.vb)
  }

  private cssSize(): { w: number; h: number } {
    return getSvgCssSize(this.svg)
  }

  private zoomByFactor(
    factor: number,
    pivotLocalCssX: number,
    pivotLocalCssY: number,
  ): void {
    const { w, h } = this.cssSize()
    const next = zoomAtPoint(
      this.vb,
      this.base,
      pivotLocalCssX,
      pivotLocalCssY,
      w,
      h,
      factor,
    )
    this.setViewBox(clampOriginToBase(next, this.base))
  }

  private zoomCentered(factor: number): void {
    const { w, h } = this.cssSize()
    const next = zoomAtCenter(this.vb, this.base, w, h, factor)
    this.setViewBox(clampOriginToBase(next, this.base))
  }

  private downloadSvg(): void {
    const xml = serializeSvgForExport(this.svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    downloadBlob(url, 'mermaid-diagram.svg')
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  private async downloadPng(): Promise<void> {
    try {
      const zoom = viewBoxScale(this.vb, this.base)
      const dataUrl = await svgToPngDataUrl(this.svg, {
        scale: exportScaleForZoom(zoom),
        background: readCssVar('--bg') || '#181818',
      })
      downloadDataUrl(dataUrl, 'mermaid-diagram.png')
    } catch (err) {
      console.error('mermaid png export failed:', err)
    }
  }

  private onToolbarClick = (e: Event): void => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.mermaid-btn')
    if (!target) return
    switch (target.dataset.action) {
      case 'zoom-in':
        this.zoomCentered(1 + ZOOM_STEP)
        break
      case 'zoom-out':
        this.zoomCentered(1 - ZOOM_STEP)
        break
      case 'reset':
        this.setViewBox({ ...this.base })
        break
      case 'download-svg':
        this.downloadSvg()
        break
      case 'download-png':
        void this.downloadPng()
        break
      case 'close':
        this.destroy()
        break
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect = this.svg.getBoundingClientRect()
    this.zoomByFactor(
      Math.exp(-e.deltaY * ZOOM_WHEEL_STEP),
      e.clientX - rect.left,
      e.clientY - rect.top,
    )
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    this.pan = {
      startX: e.clientX,
      startY: e.clientY,
      originVb: { ...this.vb },
      pointerId: e.pointerId,
    }
    this.stage.setPointerCapture(e.pointerId)
    this.stage.classList.add('is-grabbing')
    document.body.classList.add('is-mermaid-dragging')
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pan) return
    const { w, h } = this.cssSize()
    const dxCss = e.clientX - this.pan.startX
    const dyCss = e.clientY - this.pan.startY
    const next = panBy(this.pan.originVb, dxCss, dyCss, w, h)
    this.setViewBox(clampOriginToBase(next, this.base))
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