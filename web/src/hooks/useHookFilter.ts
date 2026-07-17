'use client'

import { useState, useMemo, useCallback } from 'react'
import type { HookRecord } from '@/types/hooks'
import type { HookStage } from '@/types/hooks'
import type { HookTier } from '@/types/hooks'
import { hookRunsInTier } from '@/types/hooks'

interface UseHookFilterReturn {
  filtered: HookRecord[]
  stages: HookStage[]
  tiers: HookTier[]
  activeStages: Set<HookStage>
  activeTiers: Set<HookTier>
  toggleStage: (stage: HookStage) => void
  toggleTier: (tier: HookTier) => void
  stageCounts: Record<string, number>
  tierCounts: Record<string, number>
}

const STAGE_ORDER: HookStage[] = ['pre-commit', 'commit-msg', 'pre-push']
const TIER_ORDER: HookTier[] = ['strict', 'poc']

export function useHookFilter(
  hooks: HookRecord[],
): UseHookFilterReturn {
  const stages = useMemo(() => {
    const present = new Set(hooks.map((h) => h.stage))
    return STAGE_ORDER.filter((s) => present.has(s))
  }, [hooks])

  const tiers = useMemo(() => {
    const present = new Set<HookTier>()
    for (const h of hooks) {
      for (const tier of TIER_ORDER) {
        if (hookRunsInTier(h, tier)) present.add(tier)
      }
    }
    return TIER_ORDER.filter((t) => present.has(t))
  }, [hooks])

  const [activeStages, setActiveStages] = useState<Set<HookStage>>(
    () => new Set(stages),
  )
  const [activeTiers, setActiveTiers] = useState<Set<HookTier>>(
    () => new Set(tiers),
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
    for (const stage of stages) {
      counts[stage] = hooks.filter((h) => h.stage === stage).length
    }
    return counts
  }, [hooks, stages])

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tier of tiers) {
      counts[tier] = hooks.filter((h) => hookRunsInTier(h, tier)).length
    }
    return counts
  }, [hooks, tiers])

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
    stages,
    tiers,
    activeStages,
    activeTiers,
    toggleStage,
    toggleTier,
    stageCounts,
    tierCounts,
  }
}
