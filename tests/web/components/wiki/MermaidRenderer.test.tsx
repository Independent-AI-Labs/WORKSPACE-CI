import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import type { MermaidController, MermaidRunner } from '@/lib/mermaid-diagram'

let currentPathname = '/workspace-ci'
vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}))

const fakeRunner: MermaidRunner = {
  run: vi.fn().mockResolvedValue(undefined),
}
const fakeInitialize = vi.fn()
Object.assign(fakeRunner, { initialize: fakeInitialize })

vi.mock('mermaid', () => ({
  default: fakeRunner,
}))

const mountMermaidDiagram = vi.fn()
const fakeControllers: Array<MermaidController> = []
vi.mock('@/lib/mermaid-diagram', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mermaid-diagram')>(
    '@/lib/mermaid-diagram',
  )
  return {
    ...actual,
    mountMermaidDiagram: (frame: HTMLElement) => {
      const ctrl: MermaidController = {
        render: vi.fn().mockResolvedValue(undefined),
        rerender: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
      }
      fakeControllers.push(ctrl)
      mountMermaidDiagram(frame)
      return ctrl
    },
  }
})

const getMermaidThemeConfig = vi.fn().mockReturnValue({ theme: 'base' })
vi.mock('@/lib/mermaid-theme', () => ({
  getMermaidThemeConfig: (theme: string) => getMermaidThemeConfig(theme),
}))

import { useThemeStore } from '@/stores/theme-store'
import { MermaidRenderer } from '@/components/wiki/MermaidRenderer'

function mountFrame(id: string): HTMLElement {
  const frame = document.createElement('div')
  frame.className = 'mermaid-frame'
  frame.dataset.mermaid = ''
  frame.id = id
  const pre = document.createElement('pre')
  pre.className = 'mermaid'
  pre.textContent = 'graph TD\n  A-->B'
  frame.appendChild(pre)
  document.body.appendChild(frame)
  return frame
}

describe('MermaidRenderer', () => {
  beforeEach(() => {
    currentPathname = '/workspace-ci'
    fakeControllers.length = 0
    mountMermaidDiagram.mockClear()
    fakeInitialize.mockClear()
    ;(fakeRunner.run as ReturnType<typeof vi.fn>).mockClear()
    getMermaidThemeConfig.mockClear()
    useThemeStore.setState({ theme: 'light' })
  })

  afterEach(() => {
    cleanup()
    document
      .querySelectorAll('.mermaid-frame')
      .forEach((el) => el.remove())
  })

  it('mounts pending mermaid frames after the runner loads', async () => {
    mountFrame('f1')
    render(<MermaidRenderer />)
    await waitFor(() => {
      expect(mountMermaidDiagram).toHaveBeenCalledTimes(1)
    })
    expect(fakeControllers).toHaveLength(1)
    await waitFor(() => {
      expect(fakeControllers[0].render).toHaveBeenCalledWith(fakeRunner)
    })
  })

  it('initializes mermaid with theme config on first run', async () => {
    mountFrame('f1')
    render(<MermaidRenderer />)
    await waitFor(() => {
      expect(fakeInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'base',
        }),
      )
    })
    expect(getMermaidThemeConfig).toHaveBeenCalledWith('light')
  })

  it('re-renders existing controllers when theme changes', async () => {
    mountFrame('f1')
    render(<MermaidRenderer />)
    await waitFor(() => {
      expect(fakeControllers[0].render).toHaveBeenCalled()
    })
    useThemeStore.setState({ theme: 'dark' })
    await waitFor(() => {
      expect(getMermaidThemeConfig).toHaveBeenCalledWith('dark')
    })
    await waitFor(() => {
      expect(fakeControllers[0].rerender).toHaveBeenCalledWith(fakeRunner)
    })
  })

  it('mounts new frames added after a navigation', async () => {
    mountFrame('f1')
    const { rerender } = render(<MermaidRenderer />)
    await waitFor(() => {
      expect(mountMermaidDiagram).toHaveBeenCalledTimes(1)
    })
    mountFrame('f2')
    currentPathname = '/workspace-gateway'
    rerender(<MermaidRenderer />)
    await waitFor(() => {
      expect(mountMermaidDiagram).toHaveBeenCalledTimes(2)
    })
    expect(fakeControllers).toHaveLength(2)
  })

  it('does not re-mount frames already marked ready', async () => {
    const frame = mountFrame('f1')
    frame.setAttribute('data-mermaid-ready', '')
    render(<MermaidRenderer />)
    await waitFor(() => {
      expect(fakeInitialize).toHaveBeenCalled()
    })
    expect(mountMermaidDiagram).not.toHaveBeenCalled()
  })

  it('destroys controllers on unmount', async () => {
    mountFrame('f1')
    const { unmount } = render(<MermaidRenderer />)
    await waitFor(() => {
      expect(fakeControllers[0].render).toHaveBeenCalled()
    })
    unmount()
    expect(fakeControllers[0].destroy).toHaveBeenCalled()
  })

  it('prunes disconnected frames before mounting new ones', async () => {
    const f1 = mountFrame('f1')
    const { rerender } = render(<MermaidRenderer />)
    await waitFor(() => {
      expect(fakeControllers).toHaveLength(1)
    })
    f1.remove()
    mountFrame('f2')
    currentPathname = '/workspace-guard'
    rerender(<MermaidRenderer />)
    await waitFor(() => {
      expect(fakeControllers).toHaveLength(2)
    })
    expect(fakeControllers[0].destroy).toHaveBeenCalled()
  })
})
