import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAnalyticsStore } from '@/stores/analytics-store'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'

describe('FeedbackWidget', () => {
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

  it('renders thumbs up and down buttons', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    expect(screen.getByLabelText('Thumbs up')).toBeInTheDocument()
    expect(screen.getByLabelText('Thumbs down')).toBeInTheDocument()
  })

  it('shows comment box after selecting a vote', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    expect(screen.getByText('Send')).toBeInTheDocument()
  })

  it('does not emit analytics event on vote selection only', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    const state = useAnalyticsStore.getState()
    expect(state.totalFeedback).toBe(0)
  })

  it('shows thanks message after submit up', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    fireEvent.click(screen.getByText('Send'))
    expect(screen.getByText(/Thanks for your feedback/)).toBeInTheDocument()
  })

  it('emits analytics event on submit', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    fireEvent.click(screen.getByText('Send'))
    const state = useAnalyticsStore.getState()
    expect(state.totalFeedback).toBe(1)
    expect(state.feedback['test']).toHaveLength(1)
    expect(state.feedback['test'][0].vote).toBe('up')
  })

  it('has group role with aria-label', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    expect(screen.getByRole('group', { name: 'Rate this content' })).toBeInTheDocument()
  })
})
