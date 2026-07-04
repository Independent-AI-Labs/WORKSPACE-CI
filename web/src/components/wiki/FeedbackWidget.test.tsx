import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAnalyticsStore } from '@/stores/analytics-store'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'

const mockShowModal = vi.fn()
const mockClose = vi.fn()

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
    mockShowModal()
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
    mockClose()
  }
  mockShowModal.mockClear()
  mockClose.mockClear()

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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FeedbackWidget', () => {
  it('renders thumbs up and down buttons', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    expect(screen.getByLabelText('Thumbs up')).toBeInTheDocument()
    expect(screen.getByLabelText('Thumbs down')).toBeInTheDocument()
  })

  it('renders count badges with initial counts', () => {
    render(
      <FeedbackWidget
        targetId="test"
        targetType="pattern"
        upCount={5}
        downCount={2}
      />,
    )
    const upBtn = screen.getByLabelText('Thumbs up')
    const downBtn = screen.getByLabelText('Thumbs down')
    expect(upBtn.querySelector('.feedback-count')?.textContent).toBe('5')
    expect(downBtn.querySelector('.feedback-count')?.textContent).toBe('2')
  })

  it('renders count badges with 0 when no counts provided', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    const upBtn = screen.getByLabelText('Thumbs up')
    expect(upBtn.querySelector('.feedback-count')?.textContent).toBe('0')
  })

  it('opens dialog on thumbs up click', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    expect(mockShowModal).toHaveBeenCalledTimes(1)
  })

  it('opens dialog on thumbs down click', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs down'))
    expect(mockShowModal).toHaveBeenCalledTimes(1)
  })

  it('shows vote confirmation in dialog', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    expect(screen.getByText('You voted thumbs up')).toBeInTheDocument()
  })

  it('shows comment textarea in dialog', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    expect(screen.getByLabelText('Optional: tell us more')).toBeInTheDocument()
  })

  it('shows Submit and Cancel buttons in dialog', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    expect(screen.getByText('Submit')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('closes dialog on Cancel without submitting', async () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(mockClose).toHaveBeenCalled()
    })
  })

  it('does not emit analytics event on vote selection only', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    const state = useAnalyticsStore.getState()
    expect(state.totalFeedback).toBe(0)
  })

  it('emits analytics event and updates count on Submit', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ upvotes: 1, downvotes: 0 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    fireEvent.click(screen.getByText('Submit'))

    await waitFor(() => {
      const state = useAnalyticsStore.getState()
      expect(state.totalFeedback).toBe(1)
      expect(state.feedback['test']).toHaveLength(1)
      expect(state.feedback['test'][0].vote).toBe('up')
    })

    const upBtn = screen.getByLabelText('Thumbs up')
    expect(upBtn.querySelector('.feedback-count')?.textContent).toBe('1')
    vi.unstubAllGlobals()
  })

  it('calls the API with sessionId on submit', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ upvotes: 1, downvotes: 0 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    fireEvent.click(screen.getByLabelText('Thumbs up'))
    fireEvent.click(screen.getByText('Submit'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({
        method: 'POST',
      }))
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sessionId).toBe('test-session')
    vi.unstubAllGlobals()
  })

  it('has group role with aria-label', () => {
    render(<FeedbackWidget targetId="test" targetType="pattern" />)
    expect(
      screen.getByRole('group', { name: 'Rate this content' }),
    ).toBeInTheDocument()
  })
})
