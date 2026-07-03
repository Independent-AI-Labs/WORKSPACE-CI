import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnalyticsStore } from '@/stores/analytics-store'
import { useFeedback } from '@/hooks/useFeedback'

describe('useFeedback', () => {
  beforeEach(() => {
    useAnalyticsStore.setState({
      events: [],
      pageViews: {},
      feedback: {},
      searchQueries: [],
      totalViews: 0,
      totalFeedback: 0,
      totalSearches: 0,
      sessionId: 'test-session',
      _topPagesDirty: true,
      _topPagesCache: [],
    })
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    expect(result.current.state).toBe('idle')
    expect(result.current.vote).toBeNull()
  })

  it('transitions to voting_up on selectVote up', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    act(() => result.current.selectVote('up'))
    expect(result.current.state).toBe('voting_up')
    expect(result.current.vote).toBe('up')
  })

  it('does not emit analytics event on selectVote only', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    act(() => result.current.selectVote('up'))
    const state = useAnalyticsStore.getState()
    expect(state.totalFeedback).toBe(0)
  })

  it('transitions to submitted_up on submit up', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    act(() => result.current.submit('up'))
    expect(result.current.state).toBe('submitted_up')
    expect(result.current.vote).toBe('up')
  })

  it('transitions to submitted_down on submit down', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    act(() => result.current.submit('down'))
    expect(result.current.state).toBe('submitted_down')
    expect(result.current.vote).toBe('down')
  })

  it('emits analytics event on submit', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    act(() => result.current.submit('up'))
    const state = useAnalyticsStore.getState()
    expect(state.totalFeedback).toBe(1)
    expect(state.feedback['test-id']).toHaveLength(1)
    expect(state.feedback['test-id'][0].vote).toBe('up')
  })

  it('sets comment via setComment', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    act(() => result.current.setComment('great work'))
    expect(result.current.comment).toBe('great work')
  })

  it('remembers saved vote on re-render', () => {
    const { result: first } = renderHook(() =>
      useFeedback('persist-id', 'pattern'),
    )
    act(() => first.current.submit('up'))

    const { result: second } = renderHook(() =>
      useFeedback('persist-id', 'pattern'),
    )
    expect(second.current.vote).toBe('up')
    expect(second.current.state).toBe('submitted_up')
  })
})
