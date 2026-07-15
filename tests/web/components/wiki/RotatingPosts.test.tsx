import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import type { LandingPost } from '@/lib/landing-posts'

const posts: LandingPost[] = [
  {
    id: 'one',
    title: 'FIRST POST',
    slides: [
      { type: 'image', src: '/a.png', subtitle: 'Slide A', content: 'Content A' },
      { type: 'image', src: '/b.png', subtitle: 'Slide B', content: 'Content B' },
    ],
  },
  {
    id: 'two',
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
    render(<RotatingPosts posts={posts} settings={{ post_interval_ms: 30000, slide_interval_ms: 1000, transition_ms: 200 }} />)
    expect(screen.getByText('FIRST POST')).toBeInTheDocument()
    expect(screen.getByText('Slide A')).toBeInTheDocument()
  })

  it('advances slides on interval', () => {
    render(<RotatingPosts posts={posts} settings={{ post_interval_ms: 30000, slide_interval_ms: 1000, transition_ms: 200 }} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Slide B')).toBeInTheDocument()
  })
})