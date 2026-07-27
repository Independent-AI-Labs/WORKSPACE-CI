import { render, screen } from '@testing-library/react'
import { TierBadge } from '@/components/TierBadge'

describe('TierBadge', () => {
  it('renders tier 1', () => {
    render(<TierBadge tier={1} />)
    expect(screen.getByText('Tier 1')).toBeInTheDocument()
  })

  it('renders tier 2', () => {
    render(<TierBadge tier={2} />)
    expect(screen.getByText('Tier 2')).toBeInTheDocument()
  })
})
