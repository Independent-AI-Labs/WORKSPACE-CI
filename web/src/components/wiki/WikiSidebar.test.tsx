import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WikiSidebar } from '@/components/wiki/WikiSidebar'
import type { WikiStats } from '@/lib/search-data'

vi.mock('next/navigation', () => ({
  usePathname: () => '/patterns',
}))

const mockStats: WikiStats = {
  hooks: 20,
  patterns: 105,
  configs: 12,
  guards: 6,
  standards: 20,
  scripts: 12,
}

describe('WikiSidebar', () => {
  it('renders navigation links', () => {
    render(<WikiSidebar stats={mockStats} />)
    expect(screen.getByText('Code Anti-Patterns')).toBeInTheDocument()
    expect(screen.getByText('Git Hooks')).toBeInTheDocument()
    expect(screen.getByText('Config Files')).toBeInTheDocument()
    expect(screen.getByText('Playground')).toBeInTheDocument()
  })

  it('highlights active route', () => {
    render(<WikiSidebar stats={mockStats} />)
    const patternsLink = screen.getByText('Code Anti-Patterns').closest('a')
    expect(patternsLink).toHaveClass('is-active')
  })

  it('renders all nav items', () => {
    render(<WikiSidebar stats={mockStats} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Runtime Hooks')).toBeInTheDocument()
    expect(screen.getByText('Guard Policies')).toBeInTheDocument()
    expect(screen.getByText('LLM Gateway')).toBeInTheDocument()
    expect(screen.getByText('Static Analysis')).toBeInTheDocument()
    expect(screen.getByText('Tools & Scripts')).toBeInTheDocument()
    expect(screen.getByText('Integration Guide')).toBeInTheDocument()
  })

  it('renders counts in brackets for items with counts', () => {
    render(<WikiSidebar stats={mockStats} />)
    expect(screen.getAllByText('[20]')).toHaveLength(2)
    expect(screen.getAllByText('[12]')).toHaveLength(2)
    expect(screen.getByText('[105]')).toBeInTheDocument()
    expect(screen.getByText('[6]')).toBeInTheDocument()
  })

  it('does not render counts for items without counts', () => {
    render(<WikiSidebar stats={mockStats} />)
    expect(screen.queryByText('[0]')).not.toBeInTheDocument()
  })

  it('renders collapse toggle button', () => {
    render(<WikiSidebar stats={mockStats} />)
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(toggle).toBeInTheDocument()
  })
})
