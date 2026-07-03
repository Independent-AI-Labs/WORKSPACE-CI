'use client'

import type { HookTier } from '@/types/hooks'
import clsx from 'clsx'

interface TierFilterProps {
  activeTiers: Set<HookTier>
  toggleTier: (tier: HookTier) => void
  tierCounts: Record<string, number>
}

const TIERS: { id: HookTier; label: string }[] = [
  { id: 'strict', label: 'Strict' },
  { id: 'poc', label: 'POC (safety)' },
]

export function TierFilter({ activeTiers, toggleTier, tierCounts }: TierFilterProps) {
  return (
    <div className="tier-filter">
      {TIERS.map((tier) => (
        <button
          key={tier.id}
          className={clsx(
            'filter-pill',
            activeTiers.has(tier.id) && 'is-active',
          )}
          onClick={() => toggleTier(tier.id)}
          aria-pressed={activeTiers.has(tier.id)}
        >
          {tier.label}
          <span className="filter-pill__count">
            {tierCounts[tier.id] ?? 0}
          </span>
        </button>
      ))}
    </div>
  )
}
