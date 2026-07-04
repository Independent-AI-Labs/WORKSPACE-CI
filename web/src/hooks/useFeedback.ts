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
  submit: (v: 'up' | 'down') => Promise<void>
  dismiss: () => void
  upCount: number
  downCount: number
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
  initialUpCount: number = 0,
  initialDownCount: number = 0,
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
  const [upCount, setUpCount] = useState(initialUpCount)
  const [downCount, setDownCount] = useState(initialDownCount)

  const state = deriveState(vote, submitted)

  const selectVote = useCallback((v: 'up' | 'down') => {
    setVote(v)
  }, [])

  const submit = useCallback(
    async (v: 'up' | 'down') => {
      const prevUp = upCount
      const prevDown = downCount

      if (vote === 'up') setUpCount((c) => Math.max(0, c - 1))
      if (vote === 'down') setDownCount((c) => Math.max(0, c - 1))
      if (v === 'up') setUpCount((c) => c + 1)
      if (v === 'down') setDownCount((c) => c + 1)

      setVote(v)
      setSubmitted(true)
      const sid = useAnalyticsStore.getState().sessionId
      addFeedback({
        type: 'feedback',
        targetId,
        targetType,
        vote: v,
        comment: comment || undefined,
        timestamp: Date.now(),
        sessionId: sid,
      })

      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetType,
            targetId,
            vote: v,
            comment: comment || undefined,
            sessionId: sid,
          }),
        })
        if (res.ok) {
          const counts = await res.json()
          setUpCount(counts.upvotes)
          setDownCount(counts.downvotes)
        } else {
          setUpCount(prevUp)
          setDownCount(prevDown)
        }
      } catch (err) {
        console.error('Failed to submit feedback to server:', err)
        setUpCount(prevUp)
        setDownCount(prevDown)
      }
    },
    [targetId, targetType, comment, addFeedback, vote, upCount, downCount],
  )

  const dismiss = useCallback(() => {
    setVote(null)
    setSubmitted(false)
    setComment('')
  }, [])

  return {
    state,
    vote,
    comment,
    setComment,
    selectVote,
    submit,
    dismiss,
    upCount,
    downCount,
  }
}
