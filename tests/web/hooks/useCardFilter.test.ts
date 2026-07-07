import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardFilter } from '@/hooks/useCardFilter'
import type { CardItem } from '@/types/card'

const items: CardItem[] = [
  { id: 'a', title: 'A', description: '', category: 'Alpha' },
  { id: 'b', title: 'B', description: '', category: 'Beta' },
  { id: 'c', title: 'C', description: '', category: 'Alpha' },
]

const categories = [
  { id: 'Alpha', label: 'Alpha' },
  { id: 'Beta', label: 'Beta' },
]

describe('useCardFilter', () => {
  it('initialises with all categories active', () => {
    const { result } = renderHook(() => useCardFilter(items, categories))
    expect(result.current.activeCategories.size).toBe(2)
    expect(result.current.visibleCount).toBe(3)
    expect(result.current.totalCount).toBe(3)
  })

  it('filters items when a category is toggled off', () => {
    const { result } = renderHook(() => useCardFilter(items, categories))
    act(() => result.current.toggleCategory('Alpha'))
    expect(result.current.activeCategories.has('Alpha')).toBe(false)
    expect(result.current.visibleCount).toBe(1)
    expect(result.current.filtered.map((i) => i.id)).toEqual(['b'])
  })

  it('selectAll reactivates all categories', () => {
    const { result } = renderHook(() => useCardFilter(items, categories))
    act(() => result.current.deselectAll())
    expect(result.current.visibleCount).toBe(0)
    act(() => result.current.selectAll())
    expect(result.current.visibleCount).toBe(3)
  })

  it('deselectAll empties the active set', () => {
    const { result } = renderHook(() => useCardFilter(items, categories))
    act(() => result.current.deselectAll())
    expect(result.current.activeCategories.size).toBe(0)
    expect(result.current.visibleCount).toBe(0)
  })

  it('computes per-category counts', () => {
    const { result } = renderHook(() => useCardFilter(items, categories))
    expect(result.current.categoryCounts).toEqual({
      Alpha: 2,
      Beta: 1,
    })
  })
})
