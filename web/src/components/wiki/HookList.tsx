'use client'

import type { HookRecord } from '@/types/hooks'
import type { FeedbackCounts } from '@/types/feedback'
import { WikiCard } from '@/components/wiki/WikiCard'
import { StageFilter } from '@/components/wiki/StageFilter'
import { TierFilter } from '@/components/wiki/TierFilter'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { useHookFilter } from '@/hooks/useHookFilter'
import { hookAdapter } from '@/lib/card-adapters'

interface HookListProps {
  hooks: HookRecord[]
  descriptions: Record<string, string>
  feedbackCounts?: Record<string, FeedbackCounts>
}

export function HookList({ hooks, descriptions, feedbackCounts = {} }: HookListProps) {
  const {
    filtered,
    activeStages,
    activeTiers,
    toggleStage,
    toggleTier,
    stageCounts,
    tierCounts,
  } = useHookFilter(hooks)

  const items = hookAdapter(filtered, descriptions)

  return (
    <div className="hook-list">
      <div className="hook-list__filters">
        <StageFilter
          activeStages={activeStages}
          toggleStage={toggleStage}
          stageCounts={stageCounts}
        />
        <TierFilter
          activeTiers={activeTiers}
          toggleTier={toggleTier}
          tierCounts={tierCounts}
        />
      </div>
      <div className="hook-list__count">
        {filtered.length} of {hooks.length} hooks
      </div>
      <div className="wiki-card-grid">
        {items.map((item, i) => {
          const hook = filtered[i]
          const counts = feedbackCounts[hook.id] ?? { upvotes: 0, downvotes: 0 }
          return (
            <WikiCard key={item.id} item={item}>
              <FeedbackWidget
                targetId={hook.id}
                targetType="hook"
                upCount={counts.upvotes}
                downCount={counts.downvotes}
              />
            </WikiCard>
          )
        })}
      </div>
    </div>
  )
}
