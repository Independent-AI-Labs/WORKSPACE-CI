'use client'

import { clsx } from 'clsx'

export function TierBadge({ tier }: { tier: 1 | 2 }) {
  return (
    <span
      className={clsx('tier-badge', tier === 2 && 'tier-badge--tier2')}
      aria-label={`Tier ${tier}`}
    >
      Tier {tier}
    </span>
  )
}
