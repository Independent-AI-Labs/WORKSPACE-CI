import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { render, screen, fireEvent } from '@testing-library/react'
import { LandingStageStacked } from '@/components/wiki/LandingStageStacked'
import { useRotatingPostsController } from '@/hooks/useRotatingPostsController'
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
    id: 'sov',
    tab_label: 'Docs',
    title: 'DOC POST',
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

function StackedHarness() {
  const controller = useRotatingPostsController(posts, settings)
  return <LandingStageStacked posts={posts} settings={settings} ui={ui} controller={controller} />
}

describe('LandingStageStacked', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders stacked content in document order', () => {
    const { container } = render(<StackedHarness />)
    const stage = container.querySelector('.landing-stage--stacked')
    expect(stage).toBeTruthy()

    const ordered = Array.from(
      stage!.querySelectorAll(
        '.landing-stage__post-tabs, .landing-stage__copy-panel--stacked-head, .landing-stage__slide-frame, .landing-stage__copy-panel--stacked-tail',
      ),
    )
    expect(ordered).toHaveLength(4)
    expect(stage!.querySelector('.landing-stage__copy-panel--stacked-head .landing-stage__post-title--stacked')).toBeTruthy()
    expect(screen.getByText('FIRST POST')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Slide A' })).toBeInTheDocument()
    expect(stage!.querySelector('.landing-stage__gesture-canvas')).toBeTruthy()
  })

  it('places nav on the media card and dots below it', () => {
    const { container } = render(<StackedHarness />)
    const mediaCard = container.querySelector('.landing-stage__media-card')
    const slideFrame = container.querySelector('.landing-stage__slide-frame')
    expect(mediaCard?.querySelector('.landing-stage__nav--prev')).toBeTruthy()
    expect(mediaCard?.querySelector('.landing-stage__nav--next')).toBeTruthy()
    expect(slideFrame?.querySelector('.landing-stage__stacked-indicators')).toBeTruthy()
    expect(mediaCard?.querySelector('.landing-stage__stacked-indicators')).toBeFalsy()
  })

  it('renders a gesture canvas for document slides', () => {
    render(<StackedHarness />)
    fireEvent.click(screen.getByRole('tab', { name: 'Docs' }))
    const docPan = document.querySelector('.landing-stage__stacked-pan--doc')
    expect(docPan?.querySelector('.landing-stage__gesture-canvas')).toBeTruthy()
  })

  it('renders a gesture canvas for image slides', () => {
    const { container } = render(<StackedHarness />)
    expect(container.querySelector('.landing-stage__stacked-pan--image')).toBeTruthy()
    expect(container.querySelector('.landing-stage__gesture-canvas-host')).toBeTruthy()
    expect(container.querySelector('.landing-stage__gesture-canvas')).toBeTruthy()
  })
})