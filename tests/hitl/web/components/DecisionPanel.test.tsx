import { render, screen } from '@testing-library/react'
import { DecisionPanel } from '@/components/DecisionPanel'

describe('DecisionPanel', () => {
  it('renders approve and deny buttons', () => {
    render(<DecisionPanel requestId="req-1" requestHash="sha256:one" />)
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /deny/i })).toBeInTheDocument()
  })

  it('disables decisions when live state is unhealthy', () => {
    render(<DecisionPanel requestId="req-2" requestHash="sha256:two" disabled />)
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeDisabled()
  })
})
