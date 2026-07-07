import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHookFilter } from '@/hooks/useHookFilter'
import type { HookRecord } from '@/types/hooks'

const hooks: HookRecord[] = [
  { id: 'h1', kind: 'shell', entry: 'ci_h1', stage: 'pre-commit', pass_filenames: false, always_run: true, mandatory: true, safety: true, applicable_to: ['any'] },
  { id: 'h2', kind: 'shell', entry: 'ci_h2', stage: 'commit-msg', pass_filenames: false, always_run: true, mandatory: true, safety: true, applicable_to: ['any'] },
  { id: 'h3', kind: 'python_module', entry: 'ci.h3', stage: 'pre-push', pass_filenames: false, always_run: true, mandatory: true, safety: false, applicable_to: ['python'] },
  { id: 'h4', kind: 'makefile_target', entry: 'lint', stage: 'pre-commit', pass_filenames: false, always_run: true, mandatory: true, safety: false, applicable_to: ['any'] },
]

describe('useHookFilter', () => {
  it('shows all hooks by default', () => {
    const { result } = renderHook(() => useHookFilter(hooks))
    expect(result.current.filtered).toHaveLength(4)
  })

  it('counts stages correctly', () => {
    const { result } = renderHook(() => useHookFilter(hooks))
    expect(result.current.stageCounts['pre-commit']).toBe(2)
    expect(result.current.stageCounts['commit-msg']).toBe(1)
    expect(result.current.stageCounts['pre-push']).toBe(1)
  })

  it('counts tiers correctly', () => {
    const { result } = renderHook(() => useHookFilter(hooks))
    expect(result.current.tierCounts['strict']).toBe(4)
    expect(result.current.tierCounts['poc']).toBe(2)
  })

  it('toggles stage filter', () => {
    const { result } = renderHook(() => useHookFilter(hooks))
    act(() => result.current.toggleStage('pre-commit'))
    expect(result.current.filtered).toHaveLength(2)
  })

  it('toggles tier filter', () => {
    const { result } = renderHook(() => useHookFilter(hooks))
    act(() => result.current.toggleTier('strict'))
    expect(result.current.filtered.every((h) => h.safety || false)).toBe(true)
  })

  it('combines stage and tier filters', () => {
    const { result } = renderHook(() => useHookFilter(hooks))
    act(() => result.current.toggleStage('pre-commit'))
    act(() => result.current.toggleStage('commit-msg'))
    act(() => result.current.toggleTier('strict'))
    expect(result.current.filtered.every((h) => h.safety)).toBe(true)
    expect(result.current.filtered.every((h) => h.stage === 'pre-push')).toBe(true)
  })
})
