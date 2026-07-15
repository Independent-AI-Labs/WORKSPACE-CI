import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServiceUnavailable } from '@/components/wiki/ServiceUnavailable'

describe('ServiceUnavailable', () => {
  it('renders title and description', () => {
    render(
      <ServiceUnavailable
        title="Grafana Unavailable"
        description="Metrics are offline."
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Grafana Unavailable')
    expect(screen.getByText('Metrics are offline.')).toBeInTheDocument()
  })

  it('renders Service Unavailable badge', () => {
    render(<ServiceUnavailable title="Test" description="Desc" />)
    expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
  })

  it('calls onRetry when Try again is clicked', () => {
    const onRetry = vi.fn()
    render(
      <ServiceUnavailable title="Test" description="Desc" onRetry={onRetry} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})