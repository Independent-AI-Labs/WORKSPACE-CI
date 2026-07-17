'use client'

import type { HookTier } from '@/types/hooks'
import clsx from 'clsx'

interface TierFilterProps {
  tiers: HookTier[]
  activeTiers: Set<HookTier>
  toggleTier: (tier: HookTier) => void
  tierCounts: Record<string, number>
}

const TIER_LABELS: Record<HookTier, string> = {
  strict: 'Strict',
  poc: 'POC (safety)',
}

export function TierFilter({ tiers, activeTiers, toggleTier, tierCounts }: TierFilterProps) {
  return (
    <div className="tier-filter">
      {tiers.map((tier) => (
        <button
          key={tier}
          className={clsx(
            'filter-pill',
            activeTiers.has(tier) && 'is-active',
          )}
          onClick={() => toggleTier(tier)}
          aria-pressed={activeTiers.has(tier)}
        >
          {TIER_LABELS[tier]}
          <span className="filter-pill__count">
            {tierCounts[tier] ?? 0}
          </span>
        </button>
      ))}
    </div>
  )
}
