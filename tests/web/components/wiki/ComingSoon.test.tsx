import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComingSoon } from '@/components/wiki/ComingSoon'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush, prefetch: vi.fn() }),
}))

vi.mock('@/lib/search-data', () => ({
  buildSearchData: () => [],
  getWikiStats: () => ({
    projects: 0,
    hooks: 0,
    patterns: 0,
    configs: 0,
    guards: 0,
    standards: 0,
    scripts: 0,
    runtimeHooks: 0,
  }),
}))

describe('ComingSoon', () => {
  it('renders the title', () => {
    render(
      <ComingSoon
        title="Static Analysis"
        description="Coming soon description."
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Static Analysis')
  })

  it('renders a Coming Soon badge', () => {
    render(
      <ComingSoon title="Test" description="Desc" />,
    )
    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })

  it('renders the description', () => {
    render(
      <ComingSoon
        title="Test"
        description="Detailed description of what is coming."
      />,
    )
    expect(screen.getByText('Detailed description of what is coming.')).toBeInTheDocument()
  })

  it('renders the hammer icon', () => {
    const { container } = render(
      <ComingSoon title="Test" description="Desc" />,
    )
    expect(container.querySelector('.coming-soon__icon')).toBeTruthy()
  })

  it('renders links when provided', () => {
    render(
      <ComingSoon
        title="Test"
        description="Desc"
        links={[
          { href: '/patterns', label: 'Browse Patterns' },
          { href: '/config', label: 'View Config' },
        ]}
      />,
    )
    expect(screen.getByText('Browse Patterns')).toBeInTheDocument()
    expect(screen.getByText('View Config')).toBeInTheDocument()
  })

  it('renders links as anchor tags with correct href', () => {
    render(
      <ComingSoon
        title="Test"
        description="Desc"
        links={[{ href: '/patterns', label: 'Browse Patterns' }]}
      />,
    )
    const link = screen.getByText('Browse Patterns').closest('a')
    expect(link).toHaveAttribute('href', '/patterns')
  })

  it('does not render links section when no links provided', () => {
    const { container } = render(
      <ComingSoon title="Test" description="Desc" />,
    )
    expect(container.querySelector('.coming-soon__links')).toBeNull()
  })

  it('does not render links section when links array is empty', () => {
    const { container } = render(
      <ComingSoon title="Test" description="Desc" links={[]} />,
    )
    expect(container.querySelector('.coming-soon__links')).toBeNull()
  })
})
