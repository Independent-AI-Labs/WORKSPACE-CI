'use client'

import { useState } from 'react'
import { useFeedback } from '@/hooks/useFeedback'
import { Modal } from '@/components/ui/Modal'
import clsx from 'clsx'
import type { FeedbackEvent } from '@/types/analytics'

interface FeedbackWidgetProps {
  targetId: string
  targetType: FeedbackEvent['targetType']
  upCount?: number
  downCount?: number
}

export function FeedbackWidget({
  targetId,
  targetType,
  upCount = 0,
  downCount = 0,
}: FeedbackWidgetProps) {
  const { state, vote, comment, setComment, submit, upCount: liveUp, downCount: liveDown } =
    useFeedback(targetId, targetType, upCount, downCount)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingVote, setPendingVote] = useState<'up' | 'down' | null>(null)

  const showThanks = state === 'submitted_up' || state === 'submitted_down'

  function handleVoteClick(e: React.MouseEvent, v: 'up' | 'down') {
    e.preventDefault()
    e.stopPropagation()
    if (vote === v && showThanks) return
    setPendingVote(v)
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!pendingVote) return
    await submit(pendingVote)
    setDialogOpen(false)
    setPendingVote(null)
    setComment('')
  }

  function handleCancel() {
    setDialogOpen(false)
    setPendingVote(null)
  }

  function stopClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      className="feedback-widget"
      role="group"
      aria-label="Rate this content"
      onClick={stopClick}
    >
      <button
        className={clsx('feedback-btn', vote === 'up' && showThanks && 'is-active')}
        onClick={(e) => handleVoteClick(e, 'up')}
        aria-label="Thumbs up"
        aria-pressed={vote === 'up' && showThanks}
      >
        <i className="ri-thumb-up-line" aria-hidden="true" />
        <span className="feedback-count">{liveUp}</span>
      </button>
      <button
        className={clsx('feedback-btn', vote === 'down' && showThanks && 'is-active')}
        onClick={(e) => handleVoteClick(e, 'down')}
        aria-label="Thumbs down"
        aria-pressed={vote === 'down' && showThanks}
      >
        <i className="ri-thumb-down-line" aria-hidden="true" />
        <span className="feedback-count">{liveDown}</span>
      </button>

      <Modal
        open={dialogOpen}
        onClose={handleCancel}
        title="Share feedback"
        ariaLabel="Feedback dialog"
      >
        <div className="feedback-dialog__body">
          <p className="feedback-dialog__vote">
            {pendingVote === 'up' ? (
              <>
                <i className="ri-thumb-up-fill" aria-hidden="true" /> You voted thumbs up
              </>
            ) : (
              <>
                <i className="ri-thumb-down-fill" aria-hidden="true" /> You voted thumbs down
              </>
            )}
          </p>
          <textarea
            className="feedback-dialog__comment"
            aria-label="Optional: tell us more"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
          <div className="feedback-dialog__actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={handleSubmit}
            >
              Submit
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
