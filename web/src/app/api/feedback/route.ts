import { NextRequest, NextResponse } from 'next/server'
import { saveFeedback, getAllFeedbackCounts } from '@/lib/feedback-loader'
import type { FeedbackSubmission } from '@/types/feedback'

const VALID_TARGET_TYPES = [
  'pattern', 'hook', 'config', 'guard', 'check', 'page', 'tooling', 'project',
] as const

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { targetType, targetId, vote, comment } = body as Partial<FeedbackSubmission>

  if (!targetType || !VALID_TARGET_TYPES.includes(targetType as typeof VALID_TARGET_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 })
  }
  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'targetId required' }, { status: 400 })
  }
  if (vote !== 'up' && vote !== 'down') {
    return NextResponse.json({ error: 'vote must be "up" or "down"' }, { status: 400 })
  }

  const sessionId = request.headers.get('x-session-id') ?? `api-${Date.now()}`

  const counts = saveFeedback(
    { targetType, targetId, vote, comment: comment || undefined },
    sessionId,
  )

  return NextResponse.json(counts)
}

export async function GET(request: NextRequest) {
  const targetType = request.nextUrl.searchParams.get('targetType')
  if (!targetType) {
    return NextResponse.json({ error: 'targetType query parameter required' }, { status: 400 })
  }

  const counts = getAllFeedbackCounts(targetType)
  return NextResponse.json(counts)
}
