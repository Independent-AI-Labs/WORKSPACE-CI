import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import type { LandingPost, LandingUi } from '@/lib/landing-posts'

const ui: LandingUi = {
  missing_content_message: 'Missing',
  source_link_label: 'Official source',
  download_link_label: 'Download PDF',
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

  it('renders a sliding indicator behind post tabs', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const indicator = container.querySelector('.landing-stage__post-tab-indicator')
    expect(indicator).toBeTruthy()
    expect(indicator).toHaveClass('is-ready')
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

  it('advances to the next post from the last slide', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 of 2' }))
    expect(screen.getByText('Slide B')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('SECOND POST')).toBeInTheDocument()
    expect(screen.getByText('Doc')).toBeInTheDocument()
  })

  it('crossfades when advancing to the next post from the last slide', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 of 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    const backdrop = container.querySelector('.landing-stage__backdrop')
    expect(backdrop).toHaveClass('is-bg-crossfading')
    expect(container.querySelector('.landing-stage__layer.is-leaving')).toBeTruthy()
    expect(container.querySelectorAll('.landing-stage__layer')).toHaveLength(3)
  })

  it('crossfades when switching posts via post tabs', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Second' }))

    const backdrop = container.querySelector('.landing-stage__backdrop')
    expect(backdrop).toHaveClass('is-bg-crossfading')

    const leavingLayers = container.querySelectorAll('.landing-stage__layer.is-leaving')
    expect(leavingLayers.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the outgoing post layers mounted when switching via post tabs', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 of 2' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Second' }))

    expect(container.querySelector('.landing-stage__layer.is-leaving')).toBeTruthy()
    expect(container.querySelectorAll('.landing-stage__layer')).toHaveLength(3)
  })

  it('advances to the next post on interval after the last slide', () => {
    render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 of 2' }))
    expect(screen.getByText('Slide B')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('SECOND POST')).toBeInTheDocument()
    expect(screen.getByText('Doc')).toBeInTheDocument()
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

  it('renders download and official links for document slides', () => {
    const docPosts: LandingPost[] = [
      {
        id: 'sov',
        title: 'SOVEREIGNTY',
        slides: [
          {
            type: 'document',
            src: '/landing/sovereignty/doc.pdf',
            source_url: 'https://eur-lex.europa.eu/example',
            subtitle: 'EU slide',
            content: 'Body text',
          },
        ],
      },
    ]
    render(<RotatingPosts posts={docPosts} settings={settings} ui={ui} />)

    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      '/landing/sovereignty/doc.pdf',
    )
    expect(screen.getByRole('link', { name: 'Official source' })).toHaveAttribute(
      'href',
      'https://eur-lex.europa.eu/example',
    )
  })
})