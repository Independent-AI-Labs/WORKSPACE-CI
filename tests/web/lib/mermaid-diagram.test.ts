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

describe('mountMermaidDiagram', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // jsdom does not implement Pointer Capture API
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

  it('zoom-in increases the svg scale', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const svg = frame.querySelector<SVGSVGElement>('svg')!
    const before = svg.style.transform
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    expect(svg.style.transform).not.toBe(before)
    expect(svg.style.transform).toContain('scale(')
    ctrl.destroy()
  })

  it('reset restores the identity transform', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const svg = frame.querySelector<SVGSVGElement>('svg')!
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    ;(frame.querySelector('[data-action="reset"]') as HTMLButtonElement).click()
    expect(svg.style.transform).toBe('translate(0px, 0px) scale(1)')
    ctrl.destroy()
  })

  it('zoom-out never drops below the minimum', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const svg = frame.querySelector<SVGSVGElement>('svg')!
    const out = frame.querySelector('[data-action="zoom-out"]') as HTMLButtonElement
    for (let i = 0; i < 50; i++) out.click()
    const match = svg.style.transform.match(/scale\(([\d.]+)\)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(0.4)
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
    const runner = fakeRunner('<svg width="10"><rect/></svg>')
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

  it('wheel zoom calls preventDefault and changes scale', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    const svg = frame.querySelector<SVGSVGElement>('svg')!
    const before = svg.style.transform
    const event = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })
    const preventSpy = vi.spyOn(event, 'preventDefault')
    pre.dispatchEvent(event)
    expect(preventSpy).toHaveBeenCalled()
    expect(svg.style.transform).not.toBe(before)
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

  it('allows panning even at scale 1 (always movable canvas)', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    const svg = frame.querySelector<SVGSVGElement>('svg')!
    expect(svg.style.transform).toBe('translate(0px, 0px) scale(1)')
    pre.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
    }))
    pre.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 140, clientY: 110, pointerId: 1, bubbles: true,
    }))
    expect(svg.style.transform).not.toBe('translate(0px, 0px) scale(1)')
    expect(svg.style.transform).toContain('translate(40px, 10px)')
    pre.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))
    ctrl.destroy()
  })

  it('disables text selection (body class) while dragging', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    expect(document.body.classList.contains('is-mermaid-dragging')).toBe(false)
    pre.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 50, clientY: 50, pointerId: 2, bubbles: true,
    }))
    expect(document.body.classList.contains('is-mermaid-dragging')).toBe(true)
    pre.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }))
    expect(document.body.classList.contains('is-mermaid-dragging')).toBe(false)
    ctrl.destroy()
  })

  it('does not show is-pannable class toggle (cursor is always grab)', async () => {
    const frame = makeFrame('graph TD\nA-->B')
    const ctrl = mountMermaidDiagram(frame)
    await ctrl.render(fakeRunner())
    const pre = frame.querySelector('pre.mermaid')!
    expect(pre.classList.contains('is-pannable')).toBe(false)
    ;(frame.querySelector('[data-action="zoom-in"]') as HTMLButtonElement).click()
    expect(pre.classList.contains('is-pannable')).toBe(false)
    ctrl.destroy()
  })
})
