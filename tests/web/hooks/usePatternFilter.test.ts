import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePatternFilter } from '@/hooks/usePatternFilter'
import type { ClassifiedPattern } from '@/types/patterns'

const patterns: ClassifiedPattern[] = [
  { pattern: 'a', reason: 'r', category: 'linter-suppression', categoryLabel: 'Linter', scope: 'content' },
  { pattern: 'b', reason: 'r', category: 'deferred-types', categoryLabel: 'Deferred', scope: 'content' },
  { pattern: 'c', reason: 'r', category: 'linter-suppression', categoryLabel: 'Linter', scope: 'content' },
  { pattern: 'd', reason: 'r', category: 'uuid', categoryLabel: 'UUID', scope: 'content' },
]

describe('usePatternFilter', () => {
  it('shows all patterns by default', () => {
    const { result } = renderHook(() => usePatternFilter(patterns))
    expect(result.current.visibleCount).toBe(4)
    expect(result.current.totalCount).toBe(4)
  })

  it('toggles a category off', () => {
    const { result } = renderHook(() => usePatternFilter(patterns))
    act(() => result.current.toggleCategory('linter-suppression'))
    expect(result.current.visibleCount).toBe(2)
    expect(result.current.activeCategories.has('linter-suppression')).toBe(false)
  })

  it('toggles a category back on', () => {
    const { result } = renderHook(() => usePatternFilter(patterns))
    act(() => result.current.toggleCategory('linter-suppression'))
    act(() => result.current.toggleCategory('linter-suppression'))
    expect(result.current.visibleCount).toBe(4)
  })

  it('selects all categories', () => {
    const { result } = renderHook(() => usePatternFilter(patterns))
    act(() => result.current.deselectAll())
    expect(result.current.visibleCount).toBe(0)
    act(() => result.current.selectAll())
    expect(result.current.visibleCount).toBe(4)
  })

  it('deselects all categories', () => {
    const { result } = renderHook(() => usePatternFilter(patterns))
    act(() => result.current.deselectAll())
    expect(result.current.visibleCount).toBe(0)
    expect(result.current.totalCount).toBe(4)
  })
})
