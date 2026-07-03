import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WikiSidebar } from '@/components/wiki/WikiSidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/patterns',
}))

describe('WikiSidebar', () => {
  it('renders navigation links', () => {
    render(<WikiSidebar />)
    expect(screen.getByText('Patterns')).toBeInTheDocument()
    expect(screen.getByText('Hooks')).toBeInTheDocument()
    expect(screen.getByText('Config')).toBeInTheDocument()
    expect(screen.getByText('Playground')).toBeInTheDocument()
  })

  it('highlights active route', () => {
    render(<WikiSidebar />)
    const patternsLink = screen.getByText('Patterns').closest('a')
    expect(patternsLink).toHaveClass('is-active')
  })

  it('renders all nav items', () => {
    render(<WikiSidebar />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Guard')).toBeInTheDocument()
    expect(screen.getByText('Checks')).toBeInTheDocument()
    expect(screen.getByText('Tiers')).toBeInTheDocument()
    expect(screen.getByText('Tooling')).toBeInTheDocument()
    expect(screen.getByText('Integration')).toBeInTheDocument()
  })
})
