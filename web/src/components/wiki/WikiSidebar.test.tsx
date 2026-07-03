import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WikiSidebar } from '@/components/wiki/WikiSidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/patterns',
}))

describe('WikiSidebar', () => {
  it('renders navigation links', () => {
    render(<WikiSidebar />)
    expect(screen.getByText('Code Anti-Patterns')).toBeInTheDocument()
    expect(screen.getByText('Git Hooks')).toBeInTheDocument()
    expect(screen.getByText('Config Files')).toBeInTheDocument()
    expect(screen.getByText('Playground')).toBeInTheDocument()
  })

  it('highlights active route', () => {
    render(<WikiSidebar />)
    const patternsLink = screen.getByText('Code Anti-Patterns').closest('a')
    expect(patternsLink).toHaveClass('is-active')
  })

  it('renders all nav items', () => {
    render(<WikiSidebar />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Workspace Guard')).toBeInTheDocument()
    expect(screen.getByText('Static Analysis')).toBeInTheDocument()
    expect(screen.getByText('Tools & Scripts')).toBeInTheDocument()
    expect(screen.getByText('Integration Guide')).toBeInTheDocument()
  })
})
