'use client'

import { useHookFilter } from '@/hooks/useHookFilter'
import type { HookRecord } from '@/types/hooks'
import clsx from 'clsx'

interface TierFilterProps {
  hooks: HookRecord[]
}

const TIERS: { id: 'strict' | 'poc'; label: string }[] = [
  { id: 'strict', label: 'Strict' },
  { id: 'poc', label: 'POC (safety)' },
]

export function TierFilter({ hooks }: TierFilterProps) {
  const { activeTiers, toggleTier, tierCounts } = useHookFilter(hooks)

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
