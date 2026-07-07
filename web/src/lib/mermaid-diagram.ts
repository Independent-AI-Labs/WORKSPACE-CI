import {
  IDENTITY_TRANSFORM,
  ZOOM_STEP,
  ZOOM_WHEEL_STEP,
  exportScaleForZoom,
  applyTransform,
  clampZoom,
  copyText,
  downloadBlob,
  downloadDataUrl,
  serializeSvg,
  svgToPngDataUrl,
  type Transform,
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
  const preEl = frame.querySelector<HTMLPreElement>('pre.mermaid')
  if (!preEl) {
    throw new Error('mermaid frame missing <pre class="mermaid">')
  }
  const pre: HTMLPreElement = preEl
  const source = pre.textContent ?? ''

  let transform: Transform = { ...IDENTITY_TRANSFORM }
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
    if (svg) {
      svg.style.display = 'block'
      applyTransform(svg, transform)
    }
  }

  function setTransform(next: Transform): void {
    transform = next
    if (svg) {
      applyTransform(svg, transform)
    }
    fullscreenOverlay?.syncTransform(transform)
  }

  function zoomAroundCenter(factor: number): void {
    const rect = pre.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const px = (cx - transform.tx) / transform.scale
    const py = (cy - transform.ty) / transform.scale
    const nextScale = clampZoom(transform.scale * factor)
    setTransform({
      scale: nextScale,
      tx: cx - px * nextScale,
      ty: cy - py * nextScale,
    })
  }

  function stepZoom(direction: 1 | -1): void {
    zoomAroundCenter(1 + direction * ZOOM_STEP)
  }

  function resetView(): void {
    setTransform({ ...IDENTITY_TRANSFORM })
  }

  function exportBackground(): string {
    return readCssVar('--bg') || '#181818'
  }

  function downloadSvg(): void {
    if (!svg) return
    const xml = serializeSvg(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    downloadBlob(url, 'mermaid-diagram.svg')
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function downloadPng(): Promise<void> {
    if (!svg) return
    try {
      const dataUrl = await svgToPngDataUrl(svg, {
        scale: exportScaleForZoom(transform.scale),
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
    fullscreenOverlay = new FullscreenOverlay(svg.cloneNode(true) as SVGSVGElement)
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
    const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_STEP)
    zoomAroundCenter(factor)
  }

  function onPointerDown(e: PointerEvent): void {
    if (!svg) return
    if (e.button !== 0) return
    pan = {
      startX: e.clientX,
      startY: e.clientY,
      originTx: transform.tx,
      originTy: transform.ty,
      pointerId: e.pointerId,
    }
    pre.setPointerCapture(e.pointerId)
    pre.classList.add('is-grabbing')
    document.body.classList.add('is-mermaid-dragging')
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pan) return
    setTransform({
      scale: transform.scale,
      tx: pan.originTx + (e.clientX - pan.startX),
      ty: pan.originTy + (e.clientY - pan.startY),
    })
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
