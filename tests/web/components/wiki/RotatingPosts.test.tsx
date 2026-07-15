import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import type { LandingPost, LandingUi } from '@/lib/landing-posts'

const ui: LandingUi = {
  missing_content_message: 'Missing',
  source_link_label: 'Official source',
  carousel_aria_label: 'Rotating posts',
  slide_tab_aria_label_template: 'Page {n} of {total}',
  prev_slide_aria_label: 'Previous page',
  next_slide_aria_label: 'Next page',
  posts_tablist_aria_label: 'Featured posts',
  post_tab_aria_label_template: '{label}',
}

const settings = {
  post_interval_ms: 30000,
  slide_interval_ms: 1000,
  transition_ms: 200,
  background_pan_duration_ms: 18000,
}

const posts: LandingPost[] = [
  {
    id: 'one',
    tab_label: 'First',
    title: 'FIRST POST',
    slides: [
      { type: 'image', src: '/a.png', subtitle: 'Slide A', content: 'Content A' },
      { type: 'image', src: '/b.png', subtitle: 'Slide B', content: 'Content B' },
    ],
  },
  {
    id: 'two',
    tab_label: 'Second',
    title: 'SECOND POST',
    slides: [
      { type: 'iframe', src: 'https://example.com/doc', subtitle: 'Doc', content: 'Doc body' },
    ],
  },
]

describe('RotatingPosts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders first slide', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    expect(screen.getByText('FIRST POST')).toBeInTheDocument()
    expect(screen.getByText('Slide A')).toBeInTheDocument()
  })

  it('renders post tabs and slide dots for the active post', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: 'Page 1 of 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 2 of 2' })).toBeInTheDocument()
  })

  it('advances slides on interval', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Slide B')).toBeInTheDocument()
  })

  it('loops from last slide back to first within a post', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 of 2' }))
    expect(screen.getByText('Slide B')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Slide A')).toBeInTheDocument()
    expect(screen.getByText('FIRST POST')).toBeInTheDocument()
  })

  it('switches posts via post tabs', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Second' }))
    expect(screen.getByText('SECOND POST')).toBeInTheDocument()
    expect(screen.getByText('Doc')).toBeInTheDocument()
  })

  it('navigates with prev and next controls', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Slide B')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('Slide A')).toBeInTheDocument()
  })
})