'use client'

import { useState, useMemo, useCallback } from 'react'
import type { HookRecord } from '@/types/hooks'
import type { HookStage } from '@/types/hooks'
import type { HookTier } from '@/types/hooks'
import { hookRunsInTier } from '@/types/hooks'

interface UseHookFilterReturn {
  filtered: HookRecord[]
  activeStages: Set<HookStage>
  activeTiers: Set<HookTier>
  toggleStage: (stage: HookStage) => void
  toggleTier: (tier: HookTier) => void
  stageCounts: Record<string, number>
  tierCounts: Record<string, number>
}

const ALL_STAGES: HookStage[] = ['pre-commit', 'commit-msg', 'pre-push']
const ALL_TIERS: HookTier[] = ['strict', 'poc']

export function useHookFilter(
  hooks: HookRecord[],
): UseHookFilterReturn {
  const [activeStages, setActiveStages] = useState<Set<HookStage>>(
    new Set(ALL_STAGES),
  )
  const [activeTiers, setActiveTiers] = useState<Set<HookTier>>(
    new Set(['strict', 'poc']),
  )

  const toggleStage = useCallback((stage: HookStage) => {
    setActiveStages((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) {
        next.delete(stage)
      } else {
        next.add(stage)
      }
      return next
    })
  }, [])

  const toggleTier = useCallback((tier: HookTier) => {
    setActiveTiers((prev) => {
      const next = new Set(prev)
      if (next.has(tier)) {
        next.delete(tier)
      } else {
        next.add(tier)
      }
      return next
    })
  }, [])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const stage of ALL_STAGES) {
      counts[stage] = hooks.filter((h) => h.stage === stage).length
    }
    return counts
  }, [hooks])

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tier of ALL_TIERS) {
      counts[tier] = hooks.filter((h) => hookRunsInTier(h, tier)).length
    }
    return counts
  }, [hooks])

  const filtered = useMemo(
    () =>
      hooks.filter(
        (h) =>
          activeStages.has(h.stage) &&
          Array.from(activeTiers).some((t) => hookRunsInTier(h, t)),
      ),
    [hooks, activeStages, activeTiers],
  )

  return {
    filtered,
    activeStages,
    activeTiers,
    toggleStage,
    toggleTier,
    stageCounts,
    tierCounts,
  }
}
