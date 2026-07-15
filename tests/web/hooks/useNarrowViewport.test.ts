import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'

describe('useNarrowViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when the viewport media query matches', () => {
    const listeners = new Map<string, () => void>()
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: (_event: string, cb: () => void) => {
          listeners.set(query, cb)
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )

    const { result } = renderHook(() => useNarrowViewport(768))
    expect(result.current).toBe(true)

    act(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          addEventListener: (_event: string, cb: () => void) => {
            listeners.set(query, cb)
          },
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )
      listeners.get('(max-width: 768px)')?.()
    })
  })
})