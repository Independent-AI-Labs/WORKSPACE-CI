import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders children', () => {
    const { getByText } = render(<Button>Click me</Button>)
    expect(getByText('Click me')).toBeInTheDocument()
  })

  it('applies variant class', () => {
    const { getByRole } = render(<Button variant="danger">Delete</Button>)
    expect(getByRole('button')).toHaveClass('btn--danger')
  })

  it('applies size class', () => {
    const { getByRole } = render(<Button size="lg">Big</Button>)
    expect(getByRole('button')).toHaveClass('btn--lg')
  })

  it('is disabled when loading', () => {
    const { getByRole } = render(<Button loading>Save</Button>)
    expect(getByRole('button')).toBeDisabled()
  })

  it('is disabled when disabled prop is set', () => {
    const { getByRole } = render(<Button disabled>Save</Button>)
    expect(getByRole('button')).toBeDisabled()
    expect(getByRole('button')).toHaveAttribute('aria-disabled', 'true')
  })

  it('fires onClick', () => {
    const onClick = vi.fn()
    const { getByRole } = render(<Button onClick={onClick}>Click</Button>)
    getByRole('button').click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
