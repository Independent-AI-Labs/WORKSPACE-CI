import {
  ZOOM_STEP,
  ZOOM_WHEEL_STEP,
  copyText,
  downloadBlob,
  downloadDataUrl,
  exportScaleForZoom,
  applyViewBox,
  clampOriginToBase,
  deriveBaseViewBox,
  getSvgCssSize,
  panBy,
  parseViewBox,
  serializeSvgForExport,
  svgToPngDataUrl,
  viewBoxScale,
  zoomAtCenter,
  zoomAtPoint,
  type ViewBox,
} from '@/lib/mermaid-export'
import {
  type ToolbarAction,
  type PanState,
  readCssVar,
  createButton,
  FullscreenOverlay,
} from '@/lib/mermaid-fullscreen'

export interface MermaidRunner {
  run(options?: {
    nodes?: ArrayLike<HTMLElement>
    querySelector?: string
    suppressErrors?: boolean
  }): Promise<void>
}

export interface MermaidController {
  render(runner: MermaidRunner): Promise<void>
  rerender(runner: MermaidRunner): Promise<void>
  destroy(): void
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { action: 'zoom-in', icon: 'ri-zoom-in-line', label: 'Zoom in', group: 'zoom' },
  { action: 'zoom-out', icon: 'ri-zoom-out-line', label: 'Zoom out', group: 'zoom' },
  { action: 'reset', icon: 'ri-restart-line', label: 'Reset view', group: 'zoom' },
  { action: 'fullscreen', icon: 'ri-fullscreen-line', label: 'Fullscreen' },
  { action: 'download-svg', icon: 'ri-download-2-line', label: 'Download SVG' },
  { action: 'download-png', icon: 'ri-image-line', label: 'Download PNG' },
  { action: 'copy-source', icon: 'ri-clipboard-line', label: 'Copy source' },
]

const COPIED_RESET_MS = 2000

function buildToolbar(): HTMLDivElement {
  const toolbar = document.createElement('div')
  toolbar.className = 'mermaid-toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', 'Diagram controls')
  let lastGroup = ''
  for (const action of TOOLBAR_ACTIONS) {
    if (lastGroup && action.group !== lastGroup) {
      const sep = document.createElement('span')
      sep.className = 'mermaid-toolbar__sep'
      toolbar.appendChild(sep)
    }
    toolbar.appendChild(createButton(action))
    lastGroup = action.group ?? ''
  }
  return toolbar
}

export function mountMermaidDiagram(frame: HTMLElement): MermaidController {
  const preEl: HTMLPreElement | null = frame.querySelector<HTMLPreElement>('pre.mermaid')
  if (!preEl) {
    throw new Error('mermaid frame missing <pre class="mermaid">')
  }
  const pre: HTMLPreElement = preEl
  const source = pre.textContent ?? ''

  let vb: ViewBox = { x: 0, y: 0, w: 800, h: 600 }
  let base: ViewBox = { x: 0, y: 0, w: 800, h: 600 }
  let svg: SVGSVGElement | null = null
  let pan: PanState | null = null
  let fullscreenOverlay: FullscreenOverlay | null = null
  const cleanups: Array<() => void> = []

  const toolbar = buildToolbar()
  frame.insertBefore(toolbar, frame.firstChild)

  pre.classList.add('mermaid-viewport')
  pre.setAttribute('tabindex', '0')
  pre.setAttribute('role', 'group')
  pre.setAttribute('aria-label', 'Diagram viewport, scroll to zoom, drag to pan')

  function syncSvg(): void {
    svg = pre.querySelector<SVGSVGElement>('svg')
    if (!svg) return
    svg.style.display = 'block'
    // Clear any inline transform that might have been applied by earlier
    // rendering attempts so the viewBox is the single source of truth.
    svg.style.transform = ''
    svg.style.transformOrigin = ''
    base = deriveBaseViewBox(svg)
    // Preserve any source-supplied viewBox. The source usually sets one
    // matching base, but in case the platform injected a partial one before
    // we touched it we prefer the parsed value if present, else derive.
    const live = parseViewBox(svg.getAttribute('viewBox'))
    vb = live ? live : { ...base }
    applyViewBox(svg, vb)
  }

  function setViewBox(next: ViewBox): void {
    vb = next
    if (svg) applyViewBox(svg, vb)
  }

  function cssSize(): { w: number; h: number } {
    return svg ? getSvgCssSize(svg) : { w: 0, h: 0 }
  }

  function zoomByFactor(
    factor: number,
    pivotLocalCssX: number,
    pivotLocalCssY: number,
  ): void {
    const { w, h } = cssSize()
    const next = zoomAtPoint(vb, base, pivotLocalCssX, pivotLocalCssY, w, h, factor)
    setViewBox(clampOriginToBase(next, base))
  }

  function zoomCentered(factor: number): void {
    const { w, h } = cssSize()
    const next = zoomAtCenter(vb, base, w, h, factor)
    setViewBox(clampOriginToBase(next, base))
  }

  function stepZoom(direction: 1 | -1): void {
    zoomCentered(1 + direction * ZOOM_STEP)
  }

  function resetView(): void {
    setViewBox({ ...base })
  }

  function exportBackground(): string {
    return readCssVar('--bg') || '#181818'
  }

  function downloadSvg(): void {
    if (!svg) return
    const xml = serializeSvgForExport(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    downloadBlob(url, 'mermaid-diagram.svg')
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function downloadPng(): Promise<void> {
    if (!svg) return
    try {
      const zoom = viewBoxScale(vb, base)
      const dataUrl = await svgToPngDataUrl(svg, {
        scale: exportScaleForZoom(zoom),
        background: exportBackground(),
      })
      downloadDataUrl(dataUrl, 'mermaid-diagram.png')
    } catch (err) {
      console.error('mermaid png export failed:', err)
    }
  }

  async function copySource(btn: HTMLButtonElement): Promise<void> {
    const ok = await copyText(source)
    const icon = btn.querySelector('i')
    if (ok) {
      btn.classList.add('is-copied')
      if (icon) {
        icon.className = 'ri-check-line'
      }
      window.setTimeout(() => {
        btn.classList.remove('is-copied')
        if (icon) icon.className = 'ri-clipboard-line'
      }, COPIED_RESET_MS)
    }
  }

  function openFullscreen(): void {
    if (!svg || fullscreenOverlay) return
    // Clone the live SVG so the inline renderer keeps its session distinct.
    const clone = svg.cloneNode(true) as SVGSVGElement
    fullscreenOverlay = new FullscreenOverlay(clone, base)
    fullscreenOverlay.mount()
  }

  function closeFullscreen(): void {
    fullscreenOverlay?.destroy()
    fullscreenOverlay = null
  }

  function onToolbarClick(e: Event): void {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.mermaid-btn')
    if (!target) return
    const action = target.dataset.action
    switch (action) {
      case 'zoom-in':
        stepZoom(1)
        break
      case 'zoom-out':
        stepZoom(-1)
        break
      case 'reset':
        resetView()
        break
      case 'fullscreen':
        openFullscreen()
        break
      case 'download-svg':
        downloadSvg()
        break
      case 'download-png':
        void downloadPng()
        break
      case 'copy-source':
        void copySource(target)
        break
    }
  }

  function onWheel(e: WheelEvent): void {
    if (!svg) return
    e.preventDefault()
    const rect = svg.getBoundingClientRect()
    const pivotX = e.clientX - rect.left
    const pivotY = e.clientY - rect.top
    const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_STEP)
    zoomByFactor(factor, pivotX, pivotY)
  }

  function onPointerDown(e: PointerEvent): void {
    if (!svg) return
    if (e.button !== 0) return
    pan = {
      startX: e.clientX,
      startY: e.clientY,
      originVb: { ...vb },
      pointerId: e.pointerId,
    }
    pre.setPointerCapture(e.pointerId)
    pre.classList.add('is-grabbing')
    document.body.classList.add('is-mermaid-dragging')
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pan) return
    const { w, h } = cssSize()
    const dxCss = e.clientX - pan.startX
    const dyCss = e.clientY - pan.startY
    // Pan is intentionally NOT clamped: at scale 1 (vb.w == base.w) the
    // clamp range collapses to base.x and the user would observe a
    // "stuck" canvas that doesn't follow the cursor. Let the viewBox
    // origin move freely across the SVG's local coordinate space; the
    // SVG's own bounding box (clipped to the viewport's overflow:auto)
    // is what visually bounds the content. clampOriginToBase is still
    // applied on zoom so out-of-bounds zoom never exposes whitespace.
    setViewBox(panBy(pan.originVb, dxCss, dyCss, w, h))
  }

  function onPointerUp(): void {
    if (!pan) return
    try {
      pre.releasePointerCapture(pan.pointerId)
    } catch (err) {
      console.debug('pointer capture already released:', err)
    }
    pan = null
    pre.classList.remove('is-grabbing')
    document.body.classList.remove('is-mermaid-dragging')
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!svg) return
    switch (e.key) {
      case '+':
      case '=':
        stepZoom(1)
        break
      case '-':
        stepZoom(-1)
        break
      case '0':
        resetView()
        break
      default:
        return
    }
    e.preventDefault()
  }

  toolbar.addEventListener('click', onToolbarClick)
  pre.addEventListener('wheel', onWheel, { passive: false })
  pre.addEventListener('pointerdown', onPointerDown)
  pre.addEventListener('pointermove', onPointerMove)
  pre.addEventListener('pointerup', onPointerUp)
  pre.addEventListener('pointercancel', onPointerUp)
  pre.addEventListener('keydown', onKeyDown)
  document.addEventListener('keydown', onEscape)

  function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape' && fullscreenOverlay) {
      e.stopPropagation()
      closeFullscreen()
    }
  }

  cleanups.push(() => {
    toolbar.removeEventListener('click', onToolbarClick)
    pre.removeEventListener('wheel', onWheel)
    pre.removeEventListener('pointerdown', onPointerDown)
    pre.removeEventListener('pointermove', onPointerMove)
    pre.removeEventListener('pointerup', onPointerUp)
    pre.removeEventListener('pointercancel', onPointerUp)
    pre.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keydown', onEscape)
    closeFullscreen()
  })

  async function runMermaid(runner: MermaidRunner): Promise<void> {
    pre.removeAttribute('data-processed')
    pre.textContent = source
    try {
      await runner.run({ nodes: [pre], suppressErrors: true })
    } catch (err) {
      console.error('mermaid render failed:', err)
    }
    syncSvg()
    frame.setAttribute('data-mermaid-ready', '')
    frame.classList.add('is-ready')
  }

  return {
    async render(runner: MermaidRunner) {
      await runMermaid(runner)
    },
    async rerender(runner: MermaidRunner) {
      await runMermaid(runner)
    },
    destroy() {
      for (const cleanup of cleanups) cleanup()
      cleanups.length = 0
      toolbar.remove()
    },
  }
}