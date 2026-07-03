import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardDetails } from '@/components/ui/CardDetails'

describe('CardDetails', () => {
  it('renders toggle button with label', () => {
    render(
      <CardDetails label="Show usage">
        <p>Content</p>
      </CardDetails>,
    )
    expect(screen.getByText('Show usage')).toBeInTheDocument()
    expect(screen.getByText('Show usage').tagName).toBe('BUTTON')
  })

  it('is collapsed by default', () => {
    render(
      <CardDetails label="Show usage">
        <p>Hidden content</p>
      </CardDetails>,
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('expands on click', () => {
    render(
      <CardDetails label="Show usage">
        <p>Hidden content</p>
      </CardDetails>,
    )
    fireEvent.click(screen.getByText('Show usage'))
    expect(screen.getByText('Hidden content')).toBeInTheDocument()
  })

  it('collapses on second click', () => {
    render(
      <CardDetails label="Show usage">
        <p>Hidden content</p>
      </CardDetails>,
    )
    const toggle = screen.getByText('Show usage')
    fireEvent.click(toggle)
    expect(screen.getByText('Hidden content')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('has aria-expanded false by default', () => {
    render(
      <CardDetails label="Show usage">
        <p>Content</p>
      </CardDetails>,
    )
    expect(screen.getByText('Show usage')).toHaveAttribute('aria-expanded', 'false')
  })

  it('has aria-expanded true when open', () => {
    render(
      <CardDetails label="Show usage">
        <p>Content</p>
      </CardDetails>,
    )
    fireEvent.click(screen.getByText('Show usage'))
    expect(screen.getByText('Show usage')).toHaveAttribute('aria-expanded', 'true')
  })

  it('respects defaultOpen prop', () => {
    render(
      <CardDetails label="Show usage" defaultOpen>
        <p>Visible content</p>
      </CardDetails>,
    )
    expect(screen.getByText('Visible content')).toBeInTheDocument()
    expect(screen.getByText('Show usage')).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders chevron icon', () => {
    render(
      <CardDetails label="Show usage">
        <p>Content</p>
      </CardDetails>,
    )
    const icon = screen.getByText('Show usage').querySelector('i')
    expect(icon).toBeInTheDocument()
    expect(icon?.className).toContain('ri-arrow-right-s-line')
  })
})
