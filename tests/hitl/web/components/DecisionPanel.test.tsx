import { render, screen } from '@testing-library/react'
import { DecisionPanel } from '@/components/DecisionPanel'

describe('DecisionPanel', () => {
  it('renders approve and deny buttons', () => {
    render(<DecisionPanel requestId="req-1" tier={1} />)
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /deny/i })).toBeInTheDocument()
  })

  it('shows tier 2 badge for tier 2 requests', () => {
    render(<DecisionPanel requestId="req-2" tier={2} />)
    expect(screen.getByText('Tier 2')).toBeInTheDocument()
  })
})
