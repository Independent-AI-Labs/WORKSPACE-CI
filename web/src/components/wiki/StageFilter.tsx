'use client'

import type { HookStage } from '@/types/hooks'
import clsx from 'clsx'

interface StageFilterProps {
  stages: HookStage[]
  stageLabels: Record<string, string>
  activeStages: Set<HookStage>
  toggleStage: (stage: HookStage) => void
  stageCounts: Record<string, number>
}

export function StageFilter({ stages, stageLabels, activeStages, toggleStage, stageCounts }: StageFilterProps) {
  return (
    <div className="stage-filter">
      {stages.map((stage) => (
        <button
          key={stage}
          className={clsx(
            'filter-pill',
            activeStages.has(stage) && 'is-active',
          )}
          onClick={() => toggleStage(stage)}
          aria-pressed={activeStages.has(stage)}
        >
          {stageLabels[stage] ?? stage}
          <span className="filter-pill__count">
            {stageCounts[stage] ?? 0}
          </span>
        </button>
      ))}
    </div>
  )
}
