import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { saveFeedback, getAllFeedbackCounts } from '@/lib/feedback-loader'
import type { FeedbackSubmission } from '@/types/feedback'

const VALID_TARGET_TYPES = [
  'pattern', 'hook', 'config', 'guard', 'check', 'page', 'tooling', 'project',
] as const

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const MAX_COMMENT_LENGTH = 500

const rateLimitMap = new Map<string, number[]>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    return false
  }
  recent.push(now)
  rateLimitMap.set(ip, recent)
  return true
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

function checkSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) {
    return false
  }
  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false
  }
  return true
}

export async function POST(request: NextRequest) {
  if (!checkSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin requests not allowed' }, { status: 403 })
  }

  const clientIp = getClientIp(request)
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before submitting again.' },
      { status: 429 },
    )
  }

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
  if (comment && typeof comment === 'string' && comment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comment too long (max ${MAX_COMMENT_LENGTH} characters)` },
      { status: 400 },
    )
  }

  const sessionId = randomUUID()

  const counts = await saveFeedback(
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
