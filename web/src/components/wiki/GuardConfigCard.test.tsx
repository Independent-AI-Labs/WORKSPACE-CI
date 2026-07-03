import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuardConfigCard } from '@/components/wiki/GuardConfigCard'
import type { GuardConfigEntry } from '@/types/content'

function makeEntry(overrides: Partial<GuardConfigEntry> = {}): GuardConfigEntry {
  return {
    name: 'guard_paths',
    title: 'Paths',
    link: '/guard/guard_paths',
    hasSchema: true,
    description: 'Filesystem paths used by the guard.',
    fieldCount: 4,
    ...overrides,
  }
}

describe('GuardConfigCard', () => {
  it('renders as a link with correct href', () => {
    render(<GuardConfigCard entry={makeEntry()} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/guard/guard_paths')
    expect(link).toHaveClass('guard-card')
  })

  it('renders the config name in a code element', () => {
    const { container } = render(<GuardConfigCard entry={makeEntry()} />)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code?.textContent).toBe('guard_paths')
    expect(code).toHaveClass('config-card__name')
  })

  it('shows shield icon', () => {
    const { container } = render(<GuardConfigCard entry={makeEntry()} />)
    const icon = container.querySelector('.config-card__header i')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass('ri-shield-keyhole-line')
  })

  it('shows has schema badge when schema exists', () => {
    render(<GuardConfigCard entry={makeEntry({ hasSchema: true })} />)
    const badge = screen.getByText('has schema')
    expect(badge).toHaveClass('badge--green')
  })

  it('shows no schema badge when schema is missing', () => {
    render(<GuardConfigCard entry={makeEntry({ hasSchema: false })} />)
    const badge = screen.getByText('no schema')
    expect(badge).toHaveClass('badge--orange')
  })

  it('renders description when provided', () => {
    render(
      <GuardConfigCard
        entry={makeEntry({ description: 'Filesystem paths used by the guard.' })}
      />,
    )
    expect(
      screen.getByText('Filesystem paths used by the guard.'),
    ).toBeInTheDocument()
  })

  it('does not render description when absent', () => {
    const { container } = render(
      <GuardConfigCard entry={makeEntry({ description: undefined })} />,
    )
    expect(container.querySelector('.config-card__description')).toBeNull()
  })

  it('renders field count when provided', () => {
    render(<GuardConfigCard entry={makeEntry({ fieldCount: 4 })} />)
    expect(screen.getByText('4 fields')).toBeInTheDocument()
  })

  it('renders singular field label for count of 1', () => {
    render(<GuardConfigCard entry={makeEntry({ fieldCount: 1 })} />)
    expect(screen.getByText('1 field')).toBeInTheDocument()
  })

  it('does not render field count when absent', () => {
    const { container } = render(
      <GuardConfigCard entry={makeEntry({ fieldCount: undefined })} />,
    )
    expect(container.querySelector('.config-card__field-count')).toBeNull()
  })
})
