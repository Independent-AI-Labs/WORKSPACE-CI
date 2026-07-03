import { readFileSync, existsSync, writeFileSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { FeedbackData, FeedbackCounts, FeedbackSubmission, FeedbackEntry } from '@/types/feedback'

const FEEDBACK_DIR = join(process.cwd(), 'data', 'feedback')

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function feedbackPath(targetType: string, targetId: string): string {
  return join(FEEDBACK_DIR, `${targetType}_${sanitizeId(targetId)}.json`)
}

function readFeedbackFile(targetType: string, targetId: string): FeedbackData | null {
  const path = feedbackPath(targetType, targetId)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as FeedbackData
  } catch (e) {
    console.error(`Failed to read feedback file ${path}:`, e)
    return null
  }
}

export function getFeedbackCounts(
  targetType: string,
  targetId: string,
): FeedbackCounts {
  const data = readFeedbackFile(targetType, targetId)
  if (!data) return { upvotes: 0, downvotes: 0 }
  return { upvotes: data.upvotes, downvotes: data.downvotes }
}

export function getAllFeedbackCounts(
  targetType: string,
): Record<string, FeedbackCounts> {
  const result: Record<string, FeedbackCounts> = {}
  if (!existsSync(FEEDBACK_DIR)) return result

  const prefix = `${targetType}_`
  for (const file of readdirSync(FEEDBACK_DIR)) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue
    try {
      const raw = readFileSync(join(FEEDBACK_DIR, file), 'utf8')
      const data = JSON.parse(raw) as FeedbackData
      const targetId = data.targetId
      result[targetId] = { upvotes: data.upvotes, downvotes: data.downvotes }
    } catch (e) {
      console.error(`Failed to parse feedback file ${file}:`, e)
      continue
    }
  }
  return result
}

export function saveFeedback(
  submission: FeedbackSubmission,
  sessionId: string,
): FeedbackCounts {
  if (!existsSync(FEEDBACK_DIR)) {
    mkdirSync(FEEDBACK_DIR, { recursive: true })
  }

  const path = feedbackPath(submission.targetType, submission.targetId)
  let data: FeedbackData

  const existing = readFeedbackFile(submission.targetType, submission.targetId)
  if (existing) {
    data = existing
    const prevVote = data.entries.length > 0
      ? data.entries[data.entries.length - 1].vote
      : null
    if (prevVote === submission.vote) {
      return { upvotes: data.upvotes, downvotes: data.downvotes }
    }
    if (prevVote === 'up') data.upvotes = Math.max(0, data.upvotes - 1)
    if (prevVote === 'down') data.downvotes = Math.max(0, data.downvotes - 1)
    if (submission.vote === 'up') data.upvotes += 1
    if (submission.vote === 'down') data.downvotes += 1
  } else {
    data = {
      targetType: submission.targetType,
      targetId: submission.targetId,
      upvotes: submission.vote === 'up' ? 1 : 0,
      downvotes: submission.vote === 'down' ? 1 : 0,
      entries: [],
    }
  }

  const entry: FeedbackEntry = {
    vote: submission.vote,
    comment: submission.comment,
    timestamp: Date.now(),
    sessionId,
  }
  data.entries.push(entry)

  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')

  return { upvotes: data.upvotes, downvotes: data.downvotes }
}
