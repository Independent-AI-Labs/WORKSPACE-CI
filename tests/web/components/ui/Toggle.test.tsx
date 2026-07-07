import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toggle } from '@/components/ui/Toggle'

describe('Toggle', () => {
  it('renders with label', () => {
    render(<Toggle checked={false} onChange={() => {}} label="Dark mode" />)
    expect(screen.getByText('Dark mode')).toBeInTheDocument()
  })

  it('has switch role', () => {
    render(<Toggle checked={false} onChange={() => {}} label="test" />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('reflects checked state', () => {
    render(<Toggle checked={true} onChange={() => {}} label="test" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('fires onChange on click', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="test" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('is disabled when disabled prop is set', () => {
    render(<Toggle checked={false} onChange={() => {}} label="test" disabled />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })
})
