import { readFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getFeedbackDir } from '@/lib/config-paths'
import type { FeedbackData, FeedbackCounts, FeedbackSubmission } from '@/types/feedback'

const FEEDBACK_DIR = getFeedbackDir()
const MAX_ENTRIES = 1000
const MAX_COMMENT_LENGTH = 500
const MAX_SESSION_ID_LENGTH = 128

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function stripControlChars(str: string): string {
  return str.replace(/[\x00-\x1f\x7f]/g, '')
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

export async function saveFeedback(
  submission: FeedbackSubmission,
): Promise<FeedbackCounts> {
  if (!existsSync(FEEDBACK_DIR)) {
    mkdirSync(FEEDBACK_DIR, { recursive: true })
  }

  const sanitizedSessionId = submission.sessionId.slice(0, MAX_SESSION_ID_LENGTH)
  const path = feedbackPath(submission.targetType, submission.targetId)
  let data: FeedbackData

  const existing = readFeedbackFile(submission.targetType, submission.targetId)
  if (existing) {
    data = existing

    const existingEntry = data.entries.find(
      (e) => e.sessionId === sanitizedSessionId,
    )
    const prevVote = existingEntry?.vote ?? null

    if (prevVote === submission.vote) {
      return { upvotes: data.upvotes, downvotes: data.downvotes }
    }

    if (prevVote === 'up') data.upvotes = Math.max(0, data.upvotes - 1)
    if (prevVote === 'down') data.downvotes = Math.max(0, data.downvotes - 1)
    if (submission.vote === 'up') data.upvotes += 1
    if (submission.vote === 'down') data.downvotes += 1

    if (existingEntry) {
      existingEntry.vote = submission.vote
      existingEntry.comment = submission.comment
        ? stripControlChars(submission.comment).slice(0, MAX_COMMENT_LENGTH)
        : undefined
      existingEntry.timestamp = Date.now()
    } else {
      const sanitizedComment = submission.comment
        ? stripControlChars(submission.comment).slice(0, MAX_COMMENT_LENGTH)
        : undefined
      data.entries.push({
        vote: submission.vote,
        comment: sanitizedComment,
        timestamp: Date.now(),
        sessionId: sanitizedSessionId,
      })
    }
  } else {
    data = {
      targetType: submission.targetType,
      targetId: submission.targetId,
      upvotes: submission.vote === 'up' ? 1 : 0,
      downvotes: submission.vote === 'down' ? 1 : 0,
      entries: [{
        vote: submission.vote,
        comment: submission.comment
          ? stripControlChars(submission.comment).slice(0, MAX_COMMENT_LENGTH)
          : undefined,
        timestamp: Date.now(),
        sessionId: sanitizedSessionId,
      }],
    }
  }

  if (data.entries.length > MAX_ENTRIES) {
    data.entries = data.entries.slice(-MAX_ENTRIES)
  }

  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')

  return { upvotes: data.upvotes, downvotes: data.downvotes }
}
