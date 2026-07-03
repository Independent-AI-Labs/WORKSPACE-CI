'use client'

import { useFeedback } from '@/hooks/useFeedback'
import clsx from 'clsx'
import type { FeedbackEvent } from '@/types/analytics'

interface FeedbackWidgetProps {
  targetId: string
  targetType: FeedbackEvent['targetType']
}

export function FeedbackWidget({ targetId, targetType }: FeedbackWidgetProps) {
  const { state, vote, comment, setComment, selectVote, submit } = useFeedback(
    targetId,
    targetType,
  )

  if (state === 'submitted_up' || state === 'submitted_down') {
    return (
      <span className="feedback-thanks">
        <i className="ri-heart-line" aria-hidden="true" />
        Thanks for your feedback
      </span>
    )
  }

  return (
    <div
      className="feedback-widget"
      role="group"
      aria-label="Rate this content"
    >
      <button
        className={clsx('feedback-btn', vote === 'up' && 'is-active')}
        onClick={() => selectVote('up')}
        aria-label="Thumbs up"
        aria-pressed={vote === 'up'}
      >
        <i className="ri-thumb-up-line" aria-hidden="true" />
      </button>
      <button
        className={clsx('feedback-btn', vote === 'down' && 'is-active')}
        onClick={() => selectVote('down')}
        aria-label="Thumbs down"
        aria-pressed={vote === 'down'}
      >
        <i className="ri-thumb-down-line" aria-hidden="true" />
      </button>
      {vote && !state.includes('submitted') && (
        <div className="feedback-comment">
          <textarea
            aria-label="Optional: tell us more"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
          <button
            onClick={() => submit(vote)}
            className="btn btn--sm btn--primary"
            aria-busy={false}
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}
