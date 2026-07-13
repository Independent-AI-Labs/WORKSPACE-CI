'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useThemeStore } from '@/stores/theme-store'
import {
  mountMermaidDiagram,
  type MermaidController,
  type MermaidRunner,
} from '@/lib/mermaid-diagram'
import { enqueueMermaidRun } from '@/lib/mermaid-run-queue'
import { getMermaidThemeConfig } from '@/lib/mermaid-theme'

interface MermaidInitializer {
  initialize(cfg: unknown): void
}

export function MermaidRenderer() {
  const pathname = usePathname()
  const theme = useThemeStore((s) => s.theme)
  const runnerRef = useRef<MermaidRunner | null>(null)
  const controllersRef = useRef<Map<HTMLElement, MermaidController>>(new Map())
  const initializedThemeRef = useRef<string | null>(null)
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  function initialize(runner: MermaidRunner, themeName: 'dark' | 'light'): void {
    if (initializedThemeRef.current === themeName) return
    const initializer = runner as unknown as MermaidInitializer
    initializer.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      ...getMermaidThemeConfig(themeName),
    })
    initializedThemeRef.current = themeName
  }

  function pruneDisconnected(): void {
    const controllers = controllersRef.current
    for (const [frame, ctrl] of controllers) {
      if (!frame.isConnected) {
        ctrl.destroy()
        controllers.delete(frame)
      }
    }
  }

  async function mountPending(): Promise<void> {
    const runner = runnerRef.current
    if (!runner) return
    pruneDisconnected()
    initialize(runner, themeRef.current)
    const controllers = controllersRef.current
    const frames = document.querySelectorAll<HTMLElement>(
      '.mermaid-frame:not([data-mermaid-ready])',
    )
    for (const frame of Array.from(frames)) {
      if (controllers.has(frame)) continue
      const ctrl = mountMermaidDiagram(frame)
      controllers.set(frame, ctrl)
      await enqueueMermaidRun(() => ctrl.render(runner))
    }
  }

  async function rerenderAll(): Promise<void> {
    const runner = runnerRef.current
    if (!runner) return
    await enqueueMermaidRun(async () => {
      pruneDisconnected()
      initialize(runner, themeRef.current)
      const controllers = controllersRef.current
      for (const ctrl of controllers.values()) {
        await ctrl.rerender(runner)
      }
    })
  }

  useEffect(() => {
    let cancelled = false
    void import('mermaid').then(({ default: mermaid }) => {
      if (cancelled) return
      runnerRef.current = mermaid as unknown as MermaidRunner
      void mountPending()
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void mountPending()
  }, [pathname])

  useEffect(() => {
    void rerenderAll()
  }, [theme])

  useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      for (const ctrl of controllers.values()) ctrl.destroy()
      controllers.clear()
    }
  }, [])

  return null
}