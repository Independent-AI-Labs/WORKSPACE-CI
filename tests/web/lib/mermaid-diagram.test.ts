import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountMermaidDiagram } from '@/lib/mermaid-diagram'
import type { MermaidRunner } from '@/lib/mermaid-diagram'

function makeFrame(source: string): HTMLElement {
  const frame = document.createElement('div')
  frame.className = 'mermaid-frame'
  const pre = document.createElement('pre')
  pre.className = 'mermaid'
  pre.textContent = source
  frame.appendChild(pre)
  document.body.appendChild(frame)
  return frame
}

// Fake mermaid SVG: width="100" height="50", no viewBox attribute. This gives
// a base ViewBox of { x:0, y:0, w:100, h:50 }, deterministically.
function fakeRunner(svgMarkup = '<svg width="100" height="50"><rect/></svg>'): MermaidRunner {
  return {
    async run(options) {
      const nodes = options?.nodes
      if (!nodes || nodes.length === 0) return
      const pre = nodes[0] as HTMLElement
      pre.innerHTML = svgMarkup
      pre.setAttribute('data-processed', '')
    },
  }
}

function svgOf(frame: HTMLElement): SVGSVGElement {
  return frame.querySelector<SVGSVGElement>('pre.mermaid svg')!
}

function viewBoxOf(frame: HTMLElement): string {
  const svg = svgOf(frame)
  expect(svg).not.toBeNull()
  return svg.getAttribute('viewBox') ?? ''
}

function viewBoxObj(frame: HTMLElement): { x: number; y: number; w: number; h: number } {
  const vb = viewBoxOf(frame)
  const parts = vb.split(/\s+/).map(Number)
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
}

describe('mountMermaidDiagram', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    HTMLElement.prototype.setPointerCapture = vi.fn()
    HTMLElement.prototype.releasePointerCapture = vi.fn()
  })

  it('throws when the mermaid pre is missing', () => {
    const frame = document.createElement('div')
    frame.className = 'mermaid-frame'
    document.body.appendChild(frame)
    expect(() => mountMermaidDiagram(frame)).toThrow()
  })

  it('builds a toolbar and renders the svg via the runner', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    expect(frame.querySelector('.mermaid-toolbar')).not.toBeNull()
    expect(frame.querySelector('pre.mermaid svg')).not.toBeNull()
    expect(frame.hasAttribute('data-mermaid-ready')).toBe(true)
    expect(frame.classList.contains('is-ready')).toBe(true)
    ctrl.destroy()
  })

  it('does not mark ready when runner produces no svg', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    const emptyRunner: MermaidRunner = {
      async run() {
        /* no svg inserted */
      },
    }
    await ctrl.render(emptyRunner)
    expect(frame.querySelector('pre.mermaid svg')).toBeNull()
    expect(frame.hasAttribute('data-mermaid-ready')).toBe(false)
    expect(frame.classList.contains('is-ready')).toBe(false)
    ctrl.destroy()
  })

  it('dedupes concurrent render calls on the same frame', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    let runCount = 0
    const slowRunner: MermaidRunner = {
      async run(options) {
        runCount += 1
        await new Promise((r) => setTimeout(r, 40))
        const nodes = options?.nodes
        if (!nodes || nodes.length === 0) return
        const pre = nodes[0] as HTMLElement
        pre.innerHTML = '<svg width="10" height="10"></svg>'
      },
    }
    await Promise.all([ctrl.render(slowRunner), ctrl.render(slowRunner)])
    expect(runCount).toBe(1)
    expect(frame.hasAttribute('data-mermaid-ready')).toBe(true)
    ctrl.destroy()
  })

  it('renders multiple frames with distinct svg content', async () => {
    const sources = [
      'graph TD\nA-->B',
      'flowchart LR\nC-->D',
      'graph TD\nE-->F',
      'flowchart TB\nG-->H',
    ]
    const frames = sources.map((src) => makeFrame(src))
    const ctrls = frames.map((f) => mountMermaidDiagram(f))
    const runner: MermaidRunner = {
      async run(options) {
        const nodes = options?.nodes
        if (!nodes || nodes.length === 0) return
        const pre = nodes[0] as HTMLElement
        const label = (pre.textContent ?? '').includes('C-->D')
          ? 'diagram-1'
          : (pre.textContent ?? '').includes('E-->F')
            ? 'diagram-2'
            : (pre.textContent ?? '').includes('G-->H')
              ? 'diagram-3'
              : 'diagram-0'
        pre.innerHTML = `<svg data-label="${label}"></svg>`
      },
    }
    for (const ctrl of ctrls) {
      await ctrl.render(runner)
    }
    const labels = frames.map(
      (f) => f.querySelector('svg')?.getAttribute('data-label'),
    )
    expect(labels).toEqual(['diagram-0', 'diagram-1', 'diagram-2', 'diagram-3'])
    for (const frame of frames) {
      expect(frame.hasAttribute('data-mermaid-ready')).toBe(true)
    }
    for (const ctrl of ctrls) ctrl.destroy()
  })

  it('initialises the viewBox to the diagram base', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    expect(viewBoxOf(frame)).toBe('0 0 100 50')
    ctrl.destroy()
  })

  it('zoom-in increases the zoom scale (shrinks the viewBox width)', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const before = viewBoxObj(frame)
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    const after = viewBoxObj(frame)
    expect(after.w).toBeLessThan(before.w)
    expect(after.h).toBeLessThan(before.h)
    ctrl.destroy()
  })

  it('reset restores the base viewBox', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    ;(frame.querySelector('[data-action="reset"]') as HTMLButtonElement).click()
    expect(viewBoxOf(frame)).toBe('0 0 100 50')
    ctrl.destroy()
  })

  it('zoom-out keeps the diagram centered in the canvas', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const out = frame.querySelector('[data-action="zoom-out"]') as HTMLButtonElement
    out.click()
    const vb = viewBoxObj(frame)
    expect(vb.w).toBeGreaterThan(100)
    expect(vb.h).toBeGreaterThan(50)
    expect(vb.x).toBeLessThan(0)
    expect(vb.y).toBeLessThan(0)
    ctrl.destroy()
  })

  it('zoom-out never drops below the minimum scale', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const base = viewBoxObj(frame)
    const out = frame.querySelector('[data-action="zoom-out"]') as HTMLButtonElement
    for (let i = 0; i < 50; i++) out.click()
    const vb = viewBoxObj(frame)
    // scale = base.w / vb.w; min is 0.4.
    const scale = base.w / vb.w
    expect(scale).toBeGreaterThanOrEqual(0.4)
    ctrl.destroy()
  })

  it('fullscreen opens an overlay dialog and close removes it', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    ;(frame.querySelector('[data-action="fullscreen"]') as HTMLButtonElement).click()
    const overlay = document.querySelector('.mermaid-fullscreen')
    expect(overlay).not.toBeNull()
    expect(overlay?.getAttribute('role')).toBe('dialog')
    ;(overlay?.querySelector('[data-action="close"]') as HTMLButtonElement).click()
    expect(document.querySelector('.mermaid-fullscreen')).toBeNull()
    ctrl.destroy()
  })

  it('escape closes the fullscreen overlay', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    ;(frame.querySelector('[data-action="fullscreen"]') as HTMLButtonElement).click()
    expect(document.querySelector('.mermaid-fullscreen')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('.mermaid-fullscreen')).toBeNull()
    ctrl.destroy()
  })

  it('rerender restores source and re-runs the runner', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    const runner = fakeRunner('<svg width="10" height="5"><rect/></svg>')
    await ctrl.render(runner)
    expect(frame.querySelector('svg')).not.toBeNull()
    const runSpy = vi.spyOn(runner, 'run')
    await ctrl.rerender(runner)
    expect(runSpy).toHaveBeenCalled()
    expect(frame.querySelector('svg')).not.toBeNull()
    ctrl.destroy()
  })

  it('copy-source writes the source to the clipboard', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeSpy },
      configurable: true,
    })
    ;(frame.querySelector('[data-action="copy-source"]') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(writeSpy).toHaveBeenCalledWith('graph TD\nA-->B')
    ctrl.destroy()
  })

  it('wheel zoom calls preventDefault and changes the viewBox', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    const before = viewBoxOf(frame)
    const event = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })
    const preventSpy = vi.spyOn(event, 'preventDefault')
    pre.dispatchEvent(event)
    expect(preventSpy).toHaveBeenCalled()
    expect(viewBoxOf(frame)).not.toBe(before)
    ctrl.destroy()
  })

  it('destroy removes the toolbar and listeners', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    expect(frame.querySelector('.mermaid-toolbar')).not.toBeNull()
    ctrl.destroy()
    expect(frame.querySelector('.mermaid-toolbar')).toBeNull()
  })

  it('pans at scale 1', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    expect(viewBoxOf(frame)).toBe('0 0 100 50')
    expect(pre.classList.contains('is-pannable')).toBe(true)
    pre.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        bubbles: true,
      }),
    )
    pre.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 140,
        clientY: 110,
        pointerId: 1,
        bubbles: true,
      }),
    )
    const vb = viewBoxObj(frame)
    expect(vb.x).toBe(-40)
    expect(vb.y).toBe(-10)
    pre.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))
    ctrl.destroy()
  })

  it('pans the viewBox origin within the diagram region when zoomed in', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    // Zoom in twice (factor 1.2 each); vb.w shrinks to ~69.4.
    const zIn = frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement
    zIn.click()
    zIn.click()
    const before = viewBoxObj(frame)
    expect(before.w).toBeLessThan(100)
    // Drag right + down 10 css px; cssW is 100 (jsdom getBoundingClientRect
    // returns 0, so getSvgCssSize reverts to the width attribute = 100 to
    // compute the cssToVb ratio). The viewBox origin should move left/up
    // by `delta * (vb.w / 100)`.
    pre.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 0,
        clientY: 0,
        pointerId: 3,
        bubbles: true,
      }),
    )
    pre.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 10,
        clientY: 5,
        pointerId: 3,
        bubbles: true,
      }),
    )
    const after = viewBoxObj(frame)
    expect(after.x).toBeLessThan(before.x)
    expect(after.y).toBeLessThan(before.y)
    pre.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true }))
    ctrl.destroy()
  })

  it('disables text selection (body class) while dragging when zoomed', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    ;(frame.querySelector('[data-action="zoom-out"]') as HTMLButtonElement).click()
    expect(document.body.classList.contains('is-mermaid-dragging')).toBe(false)
    pre.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 50,
        clientY: 50,
        pointerId: 2,
        bubbles: true,
      }),
    )
    expect(document.body.classList.contains('is-mermaid-dragging')).toBe(true)
    pre.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }))
    expect(document.body.classList.contains('is-mermaid-dragging')).toBe(false)
    ctrl.destroy()
  })

  it('keeps is-pannable at every zoom level', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    const zIn = frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement
    const zOut = frame.querySelector('[data-action="zoom-out"]') as HTMLButtonElement
    const reset = frame.querySelector('[data-action="reset"]') as HTMLButtonElement
    expect(pre.classList.contains('is-pannable')).toBe(true)
    zIn.click()
    expect(pre.classList.contains('is-pannable')).toBe(true)
    reset.click()
    expect(pre.classList.contains('is-pannable')).toBe(true)
    zOut.click()
    expect(pre.classList.contains('is-pannable')).toBe(true)
    reset.click()
    expect(pre.classList.contains('is-pannable')).toBe(true)
    ctrl.destroy()
  })

  it('pans when zoomed out', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    ;(frame.querySelector('[data-action="zoom-out"]') as HTMLButtonElement).click()
    expect(viewBoxObj(frame).w).toBeGreaterThan(100)
    const before = viewBoxObj(frame)
    pre.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 0,
        clientY: 0,
        pointerId: 4,
        bubbles: true,
      }),
    )
    pre.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 20,
        clientY: 10,
        pointerId: 4,
        bubbles: true,
      }),
    )
    const after = viewBoxObj(frame)
    expect(after.x).toBeLessThan(before.x)
    expect(after.y).toBeLessThan(before.y)
    pre.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4, bubbles: true }))
    ctrl.destroy()
  })

  it('does not apply any CSS transform to the svg (viewBox-only zoom)', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const svg = svgOf(frame)
    expect(svg.style.transform).toBe('')
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    expect(svg.style.transform).toBe('')
    expect(svg.style.transformOrigin).toBe('')
    ctrl.destroy()
  })
})