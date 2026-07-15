import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WikiBreadcrumbs } from '@/components/wiki/WikiBreadcrumbs'
import { WIKI_NAV_ITEMS } from '@/lib/wiki-nav'

const mockUsePathname = vi.fn(() => '/')

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

describe('WikiBreadcrumbs', () => {
  it('uses sidebar nav labels for top-level routes when home landing is enabled', () => {
    for (const item of WIKI_NAV_ITEMS) {
      mockUsePathname.mockReturnValue(item.href)
      const { unmount } = render(<WikiBreadcrumbs homeLandingEnabled />)
      expect(screen.getByText('Home')).toBeInTheDocument()
      expect(screen.getByText(item.label)).toBeInTheDocument()
      unmount()
    }
  })

  it('shows only the nav label on /projects when home landing is disabled', () => {
    mockUsePathname.mockReturnValue('/projects')
    render(<WikiBreadcrumbs homeLandingEnabled={false} />)
    expect(screen.getByText('Open Source')).toBeInTheDocument()
    expect(screen.queryByText('Projects')).not.toBeInTheDocument()
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
  })

  it('uses nav labels for nested section routes', () => {
    mockUsePathname.mockReturnValue('/patterns/banned')
    render(<WikiBreadcrumbs homeLandingEnabled />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Code Anti-Patterns')).toBeInTheDocument()
    expect(screen.getByText('banned')).toBeInTheDocument()
  })
})