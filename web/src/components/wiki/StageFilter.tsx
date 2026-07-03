'use client'

import type { HookStage } from '@/types/hooks'
import clsx from 'clsx'

interface StageFilterProps {
  activeStages: Set<HookStage>
  toggleStage: (stage: HookStage) => void
  stageCounts: Record<string, number>
}

const STAGES: { id: HookStage; label: string }[] = [
  { id: 'pre-commit', label: 'Pre-commit' },
  { id: 'commit-msg', label: 'Commit-msg' },
  { id: 'pre-push', label: 'Pre-push' },
]

export function StageFilter({ activeStages, toggleStage, stageCounts }: StageFilterProps) {
  return (
    <div className="stage-filter">
      {STAGES.map((stage) => (
        <button
          key={stage.id}
          className={clsx(
            'filter-pill',
            activeStages.has(stage.id) && 'is-active',
          )}
          onClick={() => toggleStage(stage.id)}
          aria-pressed={activeStages.has(stage.id)}
        >
          {stage.label}
          <span className="filter-pill__count">
            {stageCounts[stage.id] ?? 0}
          </span>
        </button>
      ))}
    </div>
  )
}
