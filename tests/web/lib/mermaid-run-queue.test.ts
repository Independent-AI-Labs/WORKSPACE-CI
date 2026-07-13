import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  enqueueMermaidRun,
  resetMermaidRunQueue,
} from '@/lib/mermaid-run-queue'

describe('enqueueMermaidRun', () => {
  beforeEach(() => {
    resetMermaidRunQueue()
  })

  it('runs tasks sequentially, not in parallel', async () => {
    const order: number[] = []
    const delay = (ms: number, id: number) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          order.push(id)
          resolve()
        }, ms)
      })

    const t1 = enqueueMermaidRun(() => delay(30, 1))
    const t2 = enqueueMermaidRun(() => delay(5, 2))
    const t3 = enqueueMermaidRun(() => delay(5, 3))
    await Promise.all([t1, t2, t3])
    expect(order).toEqual([1, 2, 3])
  })

  it('continues the chain after a task rejects', async () => {
    const order: number[] = []
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await enqueueMermaidRun(async () => {
      order.push(1)
      throw new Error('fail')
    }).catch(() => {})
    await enqueueMermaidRun(async () => {
      order.push(2)
    })
    expect(order).toEqual([1, 2])
    consoleSpy.mockRestore()
  })
})