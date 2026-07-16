import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import type { LandingPost, LandingUi } from '@/lib/landing-posts'

const ui: LandingUi = {
  missing_content_message: 'Missing',
  source_link_label: 'Official source',
  download_link_label: 'Download PDF',
  solutions_link_prefix: 'Browse solutions:',
  resources_link_prefix: 'Resources:',
  carousel_aria_label: 'Rotating posts',
  slide_tab_aria_label_template: 'Page {n} of {total}',
  prev_slide_aria_label: 'Previous page',
  next_slide_aria_label: 'Next page',
  posts_tablist_aria_label: 'Featured posts',
  post_tab_aria_label_template: '{label}',
  post_tabs_scroll_prev_aria_label: 'Scroll tabs left',
  post_tabs_scroll_next_aria_label: 'Scroll tabs right',
}

const settings = {
  post_interval_ms: 30000,
  slide_interval_ms: 1000,
  transition_ms: 200,
  text_transition_ms: 80,
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

function carouselScope(container: HTMLElement) {
  const root = container.querySelector('.landing-stage__variant--carousel')
  if (!root) throw new Error('missing carousel variant')
  return within(root as HTMLElement)
}

function stackedScope(container: HTMLElement) {
  const root = container.querySelector('.landing-stage__variant--stacked')
  if (!root) throw new Error('missing stacked variant')
  return within(root as HTMLElement)
}

function mockMatchMedia(matchesNarrow = false, reducedMotion = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width')
        ? matchesNarrow
        : query.includes('prefers-reduced-motion')
          ? reducedMotion
          : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

describe('RotatingPosts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockMatchMedia(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders stacked layout on narrow viewports', () => {
    mockMatchMedia(true)
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    expect(container.querySelector('.landing-stage__variant--stacked .landing-stage--stacked')).toBeTruthy()
    expect(container.querySelector('.landing-stage__variant--carousel .landing-stage--carousel')).toBeTruthy()
    const stacked = stackedScope(container)
    expect(stacked.getByText('FIRST POST')).toBeInTheDocument()
    expect(stacked.getByText('Slide A')).toBeInTheDocument()
  })

  it('renders first slide', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)
    expect(carousel.getByText('FIRST POST')).toBeInTheDocument()
    expect(carousel.getByText('Slide A')).toBeInTheDocument()
  })

  it('renders a sliding indicator behind post tabs', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const indicator = container.querySelector(
      '.landing-stage__variant--carousel .landing-stage__post-tab-indicator',
    )
    expect(indicator).toBeTruthy()
    expect(indicator).toHaveClass('is-ready')
  })

  it('renders post tabs and slide dots for the active post', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)
    expect(carousel.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'true')
    expect(carousel.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'false')
    expect(carousel.getByRole('button', { name: 'Page 1 of 2' })).toBeInTheDocument()
    expect(carousel.getByRole('button', { name: 'Page 2 of 2' })).toBeInTheDocument()
  })

  it('advances slides on interval', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(carouselScope(container).getByText('Slide B')).toBeInTheDocument()
  })

  it('advances to the next post from the last slide', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    fireEvent.click(carousel.getByRole('button', { name: 'Page 2 of 2' }))
    expect(carousel.getByText('Slide B')).toBeInTheDocument()

    fireEvent.click(carousel.getByRole('button', { name: 'Next page' }))
    expect(carousel.getByText('SECOND POST')).toBeInTheDocument()
    expect(carousel.getByText('Doc')).toBeInTheDocument()
  })

  it('crossfades when advancing to the next post from the last slide', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    fireEvent.click(carousel.getByRole('button', { name: 'Page 2 of 2' }))
    fireEvent.click(carousel.getByRole('button', { name: 'Next page' }))

    const backdrop = container.querySelector('.landing-stage__variant--carousel .landing-stage__backdrop')
    expect(backdrop).toHaveClass('is-bg-crossfading')
    expect(
      container.querySelector('.landing-stage__variant--carousel .landing-stage__layer.is-leaving'),
    ).toBeTruthy()
    expect(container.querySelectorAll('.landing-stage__variant--carousel .landing-stage__layer')).toHaveLength(3)
  })

  it('crossfades when switching posts via post tabs', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    fireEvent.click(carousel.getByRole('tab', { name: 'Second' }))

    const backdrop = container.querySelector('.landing-stage__variant--carousel .landing-stage__backdrop')
    expect(backdrop).toHaveClass('is-bg-crossfading')

    const leavingLayers = container.querySelectorAll(
      '.landing-stage__variant--carousel .landing-stage__layer.is-leaving',
    )
    expect(leavingLayers.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the outgoing post layers mounted when switching via post tabs', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    fireEvent.click(carousel.getByRole('button', { name: 'Page 2 of 2' }))
    fireEvent.click(carousel.getByRole('tab', { name: 'Second' }))

    expect(
      container.querySelector('.landing-stage__variant--carousel .landing-stage__layer.is-leaving'),
    ).toBeTruthy()
    expect(container.querySelectorAll('.landing-stage__variant--carousel .landing-stage__layer')).toHaveLength(3)
  })

  it('advances to the next post on interval after the last slide', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    fireEvent.click(carousel.getByRole('button', { name: 'Page 2 of 2' }))
    expect(carousel.getByText('Slide B')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(carousel.getByText('SECOND POST')).toBeInTheDocument()
    expect(carousel.getByText('Doc')).toBeInTheDocument()
  })

  it('switches posts via post tabs', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    fireEvent.click(carousel.getByRole('tab', { name: 'Second' }))
    expect(carousel.getByText('SECOND POST')).toBeInTheDocument()
    expect(carousel.getByText('Doc')).toBeInTheDocument()
  })

  it('navigates with prev and next controls', () => {
    const { container } = render(<RotatingPosts posts={posts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    fireEvent.click(carousel.getByRole('button', { name: 'Next page' }))
    expect(carousel.getByText('Slide B')).toBeInTheDocument()

    fireEvent.click(carousel.getByRole('button', { name: 'Previous page' }))
    expect(carousel.getByText('Slide A')).toBeInTheDocument()
  })

  it('renders internal wiki link for image slides with site-relative source_url', () => {
    const clankerPosts: LandingPost[] = [
      {
        id: 'clankers',
        title: 'CLANKERS',
        slides: [
          {
            type: 'image',
            src: '/landing/clankers/grok-bad.png',
            source_url: '/hooks',
            source_label: 'Git Hooks',
            subtitle: 'Unbounded agents',
            content: 'Body text',
          },
        ],
      },
    ]
    const { container } = render(<RotatingPosts posts={clankerPosts} settings={settings} ui={ui} />)

    const link = carouselScope(container).getByRole('link', { name: 'Git Hooks' })
    expect(link).toHaveAttribute('href', '/hooks')
    expect(link).not.toHaveAttribute('target', '_blank')
    expect(link).toHaveClass('landing-stage__link--internal')
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
    const { container } = render(<RotatingPosts posts={docPosts} settings={settings} ui={ui} />)
    const carousel = carouselScope(container)

    expect(carousel.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      '/landing/sovereignty/doc.pdf',
    )
    expect(carousel.getByRole('link', { name: 'Official source' })).toHaveAttribute(
      'href',
      'https://eur-lex.europa.eu/example',
    )
  })
})