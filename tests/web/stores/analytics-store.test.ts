import { describe, it, expect, beforeEach } from 'vitest'
import { useAnalyticsStore } from '@/stores/analytics-store'
import type { PageViewEvent, FeedbackEvent, SearchEvent } from '@/types/analytics'

describe('analytics-store', () => {
  beforeEach(() => {
    useAnalyticsStore.setState({
      events: [],
      pageViews: {},
      dwellTimes: {},
      feedback: {},
      searchQueries: [],
      totalViews: 0,
      totalFeedback: 0,
      totalSearches: 0,
      sessionId: 'test-session',
      lastActivityAt: Date.now(),
      _topPagesDirty: true,
      _topPagesCache: [],
    })
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear()
    }
  })

  it('tracks page view events', () => {
    const event: PageViewEvent = {
      type: 'page_view',
      path: '/patterns',
      title: 'Patterns',
      timestamp: Date.now(),
      referrer: '',
      sessionId: 'test-session',
    }
    useAnalyticsStore.getState().track(event)
    const state = useAnalyticsStore.getState()
    expect(state.totalViews).toBe(1)
    expect(state.pageViews['/patterns']).toBe(1)
  })

  it('tracks feedback events', () => {
    const event: FeedbackEvent = {
      type: 'feedback',
      targetId: 'test-pattern',
      targetType: 'pattern',
      vote: 'up',
      timestamp: Date.now(),
      sessionId: 'test-session',
    }
    useAnalyticsStore.getState().addFeedback(event)
    const state = useAnalyticsStore.getState()
    expect(state.totalFeedback).toBe(1)
    expect(state.feedback['test-pattern']).toHaveLength(1)
  })

  it('returns user vote', () => {
    const event: FeedbackEvent = {
      type: 'feedback',
      targetId: 'test-pattern',
      targetType: 'pattern',
      vote: 'down',
      timestamp: Date.now(),
      sessionId: 'test-session',
    }
    useAnalyticsStore.getState().addFeedback(event)
    const vote = useAnalyticsStore.getState().getUserVote('test-pattern')
    expect(vote).toBe('down')
  })

  it('returns null for unknown user vote', () => {
    const vote = useAnalyticsStore.getState().getUserVote('unknown')
    expect(vote).toBeNull()
  })

  it('tracks search events', () => {
    const event: SearchEvent = {
      type: 'search',
      query: 'test',
      resultCount: 5,
      timestamp: Date.now(),
      sessionId: 'test-session',
    }
    useAnalyticsStore.getState().track(event)
    const state = useAnalyticsStore.getState()
    expect(state.totalSearches).toBe(1)
    expect(state.searchQueries).toHaveLength(1)
  })

  it('returns top pages sorted by views', () => {
    const baseEvent = {
      type: 'page_view' as const,
      title: '',
      timestamp: Date.now(),
      referrer: '',
      sessionId: 'test-session',
    }
    useAnalyticsStore.getState().track({ ...baseEvent, path: '/a' })
    useAnalyticsStore.getState().track({ ...baseEvent, path: '/b' })
    useAnalyticsStore.getState().track({ ...baseEvent, path: '/b' })
    useAnalyticsStore.getState().track({ ...baseEvent, path: '/b' })
    const top = useAnalyticsStore.getState().getTopPages(2)
    expect(top[0].path).toBe('/b')
    expect(top[0].views).toBe(3)
    expect(top[1].path).toBe('/a')
    expect(top[1].views).toBe(1)
  })

  it('returns more pages when limit increases after caching', () => {
    const baseEvent = {
      type: 'page_view' as const,
      title: '',
      timestamp: Date.now(),
      referrer: '',
      sessionId: 'test-session',
    }
    useAnalyticsStore.getState().track({ ...baseEvent, path: '/a' })
    useAnalyticsStore.getState().track({ ...baseEvent, path: '/b' })
    useAnalyticsStore.getState().track({ ...baseEvent, path: '/c' })

    const top2 = useAnalyticsStore.getState().getTopPages(2)
    expect(top2).toHaveLength(2)

    const top5 = useAnalyticsStore.getState().getTopPages(5)
    expect(top5).toHaveLength(3)
  })

  it('returns 0 for unviewed page', () => {
    const views = useAnalyticsStore.getState().getPageViews('/nonexistent')
    expect(views).toBe(0)
  })
})
