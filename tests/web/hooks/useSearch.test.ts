import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useSearch } from '@/hooks/useSearch'
import type { SearchIndexEntry } from '@/types/wiki'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: vi.fn() }),
}))

const data: SearchIndexEntry[] = [
  { id: '1', title: 'test pattern', section: 'Patterns', content: 'test content', href: '/patterns', type: 'pattern', keywords: ['test'] },
  { id: '2', title: 'check hook', section: 'Hooks', content: 'hook content', href: '/hooks', type: 'hook', keywords: ['hook'] },
]

function mockKeyEvent(key: string): ReactKeyboardEvent<HTMLInputElement> {
  return {
    key,
    nativeEvent: { isComposing: false } as KeyboardEvent,
    keyCode: 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ReactKeyboardEvent<HTMLInputElement>
}

describe('useSearch', () => {
  it('starts closed with empty query', () => {
    const { result } = renderHook(() => useSearch(data))
    expect(result.current.isOpen).toBe(false)
    expect(result.current.query).toBe('')
    expect(result.current.results).toEqual([])
  })

  it('returns results when query is set', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('test')
    })
    expect(result.current.results.length).toBeGreaterThan(0)
  })

  it('returns empty for empty query', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => result.current.setQuery(''))
    expect(result.current.results).toEqual([])
  })

  it('opens and closes', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
    expect(result.current.query).toBe('')
  })

  it('resets selected index on close', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.setSelectedIndex(5)
      result.current.close()
    })
    expect(result.current.selectedIndex).toBe(0)
  })

  it('resets selected index when query changes', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('test')
      result.current.setSelectedIndex(1)
      result.current.setQuery('test hook')
    })
    expect(result.current.selectedIndex).toBe(0)
  })

  it('ArrowDown moves selection down', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('content')
    })
    expect(result.current.results.length).toBeGreaterThan(1)
    act(() => result.current.handleInputKeyDown(mockKeyEvent('ArrowDown')))
    expect(result.current.selectedIndex).toBe(1)
  })

  it('ArrowUp moves selection up', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('content')
      result.current.setSelectedIndex(1)
    })
    act(() => result.current.handleInputKeyDown(mockKeyEvent('ArrowUp')))
    expect(result.current.selectedIndex).toBe(0)
  })

  it('ArrowDown does not exceed last result', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('content')
    })
    const last = result.current.results.length - 1
    act(() => result.current.setSelectedIndex(last))
    act(() => result.current.handleInputKeyDown(mockKeyEvent('ArrowDown')))
    expect(result.current.selectedIndex).toBe(last)
  })

  it('Home jumps to first result', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('content')
      result.current.setSelectedIndex(1)
    })
    act(() => result.current.handleInputKeyDown(mockKeyEvent('Home')))
    expect(result.current.selectedIndex).toBe(0)
  })

  it('End jumps to last result', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('content')
    })
    act(() => result.current.handleInputKeyDown(mockKeyEvent('End')))
    expect(result.current.selectedIndex).toBe(result.current.results.length - 1)
  })

  it('Escape closes the search', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('test')
    })
    act(() => result.current.handleInputKeyDown(mockKeyEvent('Escape')))
    expect(result.current.isOpen).toBe(false)
    expect(result.current.query).toBe('')
  })

  it('Enter selects result and navigates', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('test')
    })
    const href = result.current.results[0].item.href
    mockPush.mockClear()
    act(() => result.current.handleInputKeyDown(mockKeyEvent('Enter')))
    expect(mockPush).toHaveBeenCalledWith(href)
    expect(result.current.isOpen).toBe(false)
  })

  it('selectResult navigates and closes', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('test')
    })
    const href = result.current.results[0].item.href
    mockPush.mockClear()
    act(() => result.current.selectResult(0))
    expect(mockPush).toHaveBeenCalledWith(href)
    expect(result.current.isOpen).toBe(false)
  })

  it('Enter does nothing during IME composition', () => {
    const { result } = renderHook(() => useSearch(data))
    act(() => {
      result.current.open()
      result.current.setQuery('test')
    })
    const imeEvent = {
      key: 'Enter',
      nativeEvent: { isComposing: true } as KeyboardEvent,
      keyCode: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as ReactKeyboardEvent<HTMLInputElement>
    mockPush.mockClear()
    act(() => result.current.handleInputKeyDown(imeEvent))
    expect(mockPush).not.toHaveBeenCalled()
  })
})
