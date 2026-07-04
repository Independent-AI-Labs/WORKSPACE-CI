import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ upvotes: 1, downvotes: 0 }),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('transitions to submitted_up on submit up', async () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    await act(async () => {
      await result.current.submit('up')
    })
    expect(result.current.state).toBe('submitted_up')
    expect(result.current.vote).toBe('up')
  })

  it('transitions to submitted_down on submit down', async () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    await act(async () => {
      await result.current.submit('down')
    })
    expect(result.current.state).toBe('submitted_down')
    expect(result.current.vote).toBe('down')
  })

  it('emits analytics event on submit', async () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern'),
    )
    await act(async () => {
      await result.current.submit('up')
    })
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

  it('remembers saved vote on re-render', async () => {
    const { result: first } = renderHook(() =>
      useFeedback('persist-id', 'pattern'),
    )
    await act(async () => {
      await first.current.submit('up')
    })

    const { result: second } = renderHook(() =>
      useFeedback('persist-id', 'pattern'),
    )
    expect(second.current.vote).toBe('up')
    expect(second.current.state).toBe('submitted_up')
  })

  it('initializes counts from props', () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern', 5, 2),
    )
    expect(result.current.upCount).toBe(5)
    expect(result.current.downCount).toBe(2)
  })

  it('increments upCount on submit up', async () => {
    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern', 0, 0),
    )
    await act(async () => {
      await result.current.submit('up')
    })
    expect(result.current.upCount).toBe(1)
  })

  it('sends sessionId in POST body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ upvotes: 1, downvotes: 0 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern', 0, 0),
    )
    await act(async () => {
      await result.current.submit('up')
    })

    const callArgs = mockFetch.mock.calls[0]
    const body = JSON.parse(callArgs[1].body)
    expect(body.sessionId).toBe('test-session')
    vi.unstubAllGlobals()
  })

  it('rolls back counts on POST failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'bad' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern', 5, 2),
    )
    await act(async () => {
      await result.current.submit('up')
    })
    expect(result.current.upCount).toBe(5)
    expect(result.current.downCount).toBe(2)
    vi.unstubAllGlobals()
  })

  it('rolls back counts on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useFeedback('test-id', 'pattern', 3, 1),
    )
    await act(async () => {
      await result.current.submit('down')
    })
    expect(result.current.upCount).toBe(3)
    expect(result.current.downCount).toBe(1)
    vi.unstubAllGlobals()
  })
})
