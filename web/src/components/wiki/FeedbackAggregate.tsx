'use client'

import { useAnalyticsStore } from '@/stores/analytics-store'
import type { FeedbackEvent } from '@/types/analytics'

const EMPTY_FEEDBACK: FeedbackEvent[] = []

interface FeedbackAggregateProps {
  targetId: string
}

export function FeedbackAggregate({ targetId }: FeedbackAggregateProps) {
  const feedback = useAnalyticsStore((s) => s.feedback[targetId] ?? EMPTY_FEEDBACK)
  const upCount = feedback.filter((f: FeedbackEvent) => f.vote === 'up').length
  const downCount = feedback.filter((f: FeedbackEvent) => f.vote === 'down').length

  return (
    <div className="feedback-aggregate">
      <span className="feedback-aggregate__up">
        <i className="ri-thumb-up-line" aria-hidden="true" />
        {upCount}
      </span>
      <span className="feedback-aggregate__down">
        <i className="ri-thumb-down-line" aria-hidden="true" />
        {downCount}
      </span>
    </div>
  )
}
