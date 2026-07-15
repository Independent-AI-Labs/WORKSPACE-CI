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
}

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
    render(
      <RotatingPosts
        posts={posts}
        settings={{ post_interval_ms: 30000, slide_interval_ms: 1000, transition_ms: 200 }}
        ui={ui}
      />,
    )
    expect(screen.getByText('FIRST POST')).toBeInTheDocument()
    expect(screen.getByText('Slide A')).toBeInTheDocument()
  })

  it('renders one dot per slide in the active post', () => {
    render(
      <RotatingPosts
        posts={posts}
        settings={{ post_interval_ms: 30000, slide_interval_ms: 1000, transition_ms: 200 }}
        ui={ui}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Page 1 of 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Page 2 of 2' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Page 1 of 1' })).not.toBeInTheDocument()
  })

  it('advances slides on interval', () => {
    render(
      <RotatingPosts
        posts={posts}
        settings={{ post_interval_ms: 30000, slide_interval_ms: 1000, transition_ms: 200 }}
        ui={ui}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Slide B')).toBeInTheDocument()
  })

  it('navigates with prev and next controls', () => {
    render(
      <RotatingPosts
        posts={posts}
        settings={{ post_interval_ms: 30000, slide_interval_ms: 1000, transition_ms: 200 }}
        ui={ui}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Slide B')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('Slide A')).toBeInTheDocument()
  })

  it('jumps to a slide when a dot is clicked', () => {
    render(
      <RotatingPosts
        posts={posts}
        settings={{ post_interval_ms: 30000, slide_interval_ms: 1000, transition_ms: 200 }}
        ui={ui}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Page 2 of 2' }))
    expect(screen.getByText('Slide B')).toBeInTheDocument()
  })
})