import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayground } from '@/hooks/usePlayground'
import type { ClassifiedPattern } from '@/types/patterns'

const patterns: ClassifiedPattern[] = [
  { pattern: 'eslint-disable', reason: 'test', category: 'linter-suppression', categoryLabel: 'Linter', scope: 'content' },
  { pattern: '\\bgetattr\\(', reason: 'test', category: 'unsafe-reflection', categoryLabel: 'Reflection', scope: 'content' },
]

describe('usePlayground', () => {
  it('initializes with default language', () => {
    const { result } = renderHook(() => usePlayground(patterns))
    expect(result.current.language).toBe('python')
    expect(result.current.matches).toEqual([])
  })

  it('changes language', () => {
    const { result } = renderHook(() => usePlayground(patterns))
    act(() => result.current.setLanguage('javascript'))
    expect(result.current.language).toBe('javascript')
  })

  it('clears matches on language change', () => {
    const { result } = renderHook(() => usePlayground(patterns))
    act(() => result.current.setMatches([
      { line: 1, column: 0, lineText: 'test', pattern: 'test', reason: 'test', category: 'test' },
    ]))
    expect(result.current.matches).toHaveLength(1)
    act(() => result.current.setLanguage('javascript'))
    expect(result.current.matches).toHaveLength(0)
  })

  it('toggles category', () => {
    const { result } = renderHook(() => usePlayground(patterns))
    expect(result.current.activeCategories.has('linter-suppression')).toBe(true)
    act(() => result.current.toggleCategory('linter-suppression'))
    expect(result.current.activeCategories.has('linter-suppression')).toBe(false)
  })

  it('provides stable editor ref', () => {
    const { result } = renderHook(() => usePlayground(patterns))
    expect(result.current.editorRef).toBeDefined()
    expect(result.current.editorRef.current).toBeNull()
  })
})
