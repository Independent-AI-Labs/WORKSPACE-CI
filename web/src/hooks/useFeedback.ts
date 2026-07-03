'use client'

import { useState, useCallback } from 'react'
import { useAnalyticsStore } from '@/stores/analytics-store'
import type { FeedbackEvent } from '@/types/analytics'

type FeedbackState = 'idle' | 'voting_up' | 'voting_down' | 'submitted_up' | 'submitted_down'

interface UseFeedbackReturn {
  state: FeedbackState
  vote: 'up' | 'down' | null
  comment: string
  setComment: (c: string) => void
  selectVote: (v: 'up' | 'down') => void
  submit: (vote: 'up' | 'down') => void
  dismiss: () => void
}

function deriveState(vote: 'up' | 'down' | null, submitted: boolean): FeedbackState {
  if (submitted && vote === 'up') return 'submitted_up'
  if (submitted && vote === 'down') return 'submitted_down'
  if (vote === 'up') return 'voting_up'
  if (vote === 'down') return 'voting_down'
  return 'idle'
}

export function useFeedback(
  targetId: string,
  targetType: FeedbackEvent['targetType'],
): UseFeedbackReturn {
  const addFeedback = useAnalyticsStore((s) => s.addFeedback)
  const savedVote = useAnalyticsStore((s) => {
    const feedbacks = s.feedback[targetId]
    if (!feedbacks || feedbacks.length === 0) return null
    return feedbacks[feedbacks.length - 1].vote
  })

  const [vote, setVote] = useState<'up' | 'down' | null>(savedVote)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(savedVote !== null)

  const state = deriveState(vote, submitted)

  const selectVote = useCallback((v: 'up' | 'down') => {
    setVote(v)
  }, [])

  const submit = useCallback(
    (v: 'up' | 'down') => {
      setVote(v)
      setSubmitted(true)
      addFeedback({
        type: 'feedback',
        targetId,
        targetType,
        vote: v,
        comment: comment || undefined,
        timestamp: Date.now(),
        sessionId: useAnalyticsStore.getState().sessionId,
      })
    },
    [targetId, targetType, comment, addFeedback],
  )

  const dismiss = useCallback(() => {
    setVote(null)
    setSubmitted(false)
    setComment('')
  }, [])

  return { state, vote, comment, setComment, selectVote, submit, dismiss }
}
