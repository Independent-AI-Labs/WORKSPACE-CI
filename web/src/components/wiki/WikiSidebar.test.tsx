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
  runtimeHooks: 0,
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
    expect(screen.getByText('[0]')).toBeInTheDocument()
  })

  it('renders [0] for Runtime Hooks', () => {
    render(<WikiSidebar stats={mockStats} />)
    const runtimeHooksLink = screen.getByText('Runtime Hooks').closest('a')
    expect(runtimeHooksLink).toHaveTextContent('[0]')
  })

  it('renders collapse toggle button', () => {
    render(<WikiSidebar stats={mockStats} />)
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(toggle).toBeInTheDocument()
  })

  it('places Standards & Regulations before LLM Gateway', () => {
    const { container } = render(<WikiSidebar stats={mockStats} />)
    const links = container.querySelectorAll('.wiki-sidebar__link')
    const labels = Array.from(links).map((l) => l.textContent?.replace(/\[\d+\]/g, '').trim())
    const standardsIdx = labels.indexOf('Standards & Regulations')
    const llmIdx = labels.indexOf('LLM Gateway')
    expect(standardsIdx).toBeGreaterThan(-1)
    expect(llmIdx).toBeGreaterThan(-1)
    expect(standardsIdx).toBeLessThan(llmIdx)
  })

  it('places Standards & Regulations after Guard Policies', () => {
    const { container } = render(<WikiSidebar stats={mockStats} />)
    const links = container.querySelectorAll('.wiki-sidebar__link')
    const labels = Array.from(links).map((l) => l.textContent?.replace(/\[\d+\]/g, '').trim())
    const standardsIdx = labels.indexOf('Standards & Regulations')
    const guardIdx = labels.indexOf('Guard Policies')
    expect(standardsIdx).toBeGreaterThan(guardIdx)
  })
})
