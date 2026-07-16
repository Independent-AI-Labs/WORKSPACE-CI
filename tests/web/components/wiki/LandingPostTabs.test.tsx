import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LandingPostTabs } from '@/components/wiki/LandingPostTabs'
import type { LandingPost, LandingUi } from '@/lib/landing-posts'

vi.mock('@/hooks/useNarrowViewport', () => ({
  useNarrowViewport: () => true,
}))

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

const posts: LandingPost[] = [
  { id: 'a', tab_label: 'Alpha', title: 'Alpha', slides: [] },
  { id: 'b', tab_label: 'Beta', title: 'Beta', slides: [] },
  { id: 'c', tab_label: 'Gamma', title: 'Gamma', slides: [] },
]

function mockTablistOverflow(
  tablist: HTMLDivElement,
  {
    clientWidth,
    scrollWidth,
    scrollLeft,
  }: { clientWidth: number; scrollWidth: number; scrollLeft: number },
) {
  Object.defineProperty(tablist, 'clientWidth', { configurable: true, value: clientWidth })
  Object.defineProperty(tablist, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(tablist, 'scrollLeft', { configurable: true, writable: true, value: scrollLeft })
}

describe('LandingPostTabs', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a right scroll hint when tabs overflow on mobile', () => {
    const { container } = render(
      <LandingPostTabs
        posts={posts}
        postIndex={0}
        ui={ui}
        reducedMotion
        onPostTab={vi.fn()}
      />,
    )

    const tablist = container.querySelector('.landing-stage__post-tabs') as HTMLDivElement
    mockTablistOverflow(tablist, { clientWidth: 120, scrollWidth: 360, scrollLeft: 0 })
    fireEvent.scroll(tablist)

    expect(screen.getByRole('button', { name: 'Scroll tabs right' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Scroll tabs left' })).toBeNull()
  })

  it('positions the active tab indicator using scroll offsets', () => {
    const { container } = render(
      <LandingPostTabs
        posts={posts}
        postIndex={1}
        ui={ui}
        reducedMotion
        onPostTab={vi.fn()}
      />,
    )

    const tablist = container.querySelector('.landing-stage__post-tabs') as HTMLDivElement
    const activeTab = screen.getByRole('tab', { selected: true })

    vi.spyOn(tablist, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 100,
      left: 40,
      top: 100,
      right: 240,
      bottom: 148,
      width: 200,
      height: 48,
      toJSON: () => ({}),
    })
    vi.spyOn(activeTab, 'getBoundingClientRect').mockReturnValue({
      x: 90,
      y: 108,
      left: 90,
      top: 108,
      right: 162,
      bottom: 140,
      width: 72,
      height: 32,
      toJSON: () => ({}),
    })
    mockTablistOverflow(tablist, { clientWidth: 120, scrollWidth: 360, scrollLeft: 80 })
    fireEvent.scroll(tablist)

    const indicator = container.querySelector(
      '.landing-stage__post-tab-indicator',
    ) as HTMLSpanElement
    expect(indicator.style.getPropertyValue('--tab-ind-x')).toBe('130px')
    expect(indicator.style.getPropertyValue('--tab-ind-w')).toBe('72px')
  })

  it('shows a left scroll hint after scrolling away from the start', () => {
    const { container } = render(
      <LandingPostTabs
        posts={posts}
        postIndex={1}
        ui={ui}
        reducedMotion
        onPostTab={vi.fn()}
      />,
    )

    const tablist = container.querySelector('.landing-stage__post-tabs') as HTMLDivElement
    mockTablistOverflow(tablist, { clientWidth: 120, scrollWidth: 360, scrollLeft: 80 })
    fireEvent.scroll(tablist)

    expect(screen.getByRole('button', { name: 'Scroll tabs left' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scroll tabs right' })).toBeTruthy()
  })
})