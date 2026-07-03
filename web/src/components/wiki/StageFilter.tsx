'use client'

import { useHookFilter } from '@/hooks/useHookFilter'
import type { HookRecord } from '@/types/hooks'
import clsx from 'clsx'

interface StageFilterProps {
  hooks: HookRecord[]
}

const STAGES: { id: 'pre-commit' | 'commit-msg' | 'pre-push'; label: string }[] = [
  { id: 'pre-commit', label: 'Pre-commit' },
  { id: 'commit-msg', label: 'Commit-msg' },
  { id: 'pre-push', label: 'Pre-push' },
]

export function StageFilter({ hooks }: StageFilterProps) {
  const { activeStages, toggleStage, stageCounts } = useHookFilter(hooks)

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
