import { NextRequest, NextResponse } from 'next/server'
import { saveFeedback, getAllFeedbackCounts } from '@/lib/feedback-loader'
import type { FeedbackSubmission } from '@/types/feedback'

const VALID_TARGET_TYPES = [
  'pattern', 'hook', 'config', 'guard', 'check', 'page', 'tooling', 'project', 'standard',
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

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const isProduction = process.env.NODE_ENV === 'production'

interface ParsedOrigin {
  protocol: string
  host: string
}

function parseOrigin(origin: string): ParsedOrigin | null {
  const match = origin.match(/^(https?):\/\/([^/]+)/)
  if (!match) return null
  return { protocol: match[1], host: match[2] }
}

function checkSameOrigin(request: NextRequest): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite) {
    return secFetchSite === 'same-origin' || secFetchSite === 'none' || secFetchSite === 'same-site'
  }

  const origin = request.headers.get('origin')
  if (!origin) {
    return true
  }

  const parsed = parseOrigin(origin)
  if (!parsed) {
    return false
  }

  const host = request.headers.get('host')
  if (host && parsed.host === host) {
    return true
  }

  if (ALLOWED_ORIGINS.length > 0) {
    const originBase = `${parsed.protocol}://${parsed.host}`
    if (ALLOWED_ORIGINS.includes(originBase)) {
      return true
    }
  }

  if (!isProduction) {
    const localhostVariants = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']
    if (localhostVariants.some((v) => parsed.host.startsWith(v))) {
      const originPort = parsed.host.split(':')[1]
      const hostPort = host?.split(':')[1]
      if (!originPort || !hostPort || originPort === hostPort) {
        return true
      }
    }
  }

  return false
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

  const { targetType, targetId, vote, comment, sessionId } = body as Partial<FeedbackSubmission>

  if (!targetType || !VALID_TARGET_TYPES.includes(targetType as typeof VALID_TARGET_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 })
  }
  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'targetId required' }, { status: 400 })
  }
  if (vote !== 'up' && vote !== 'down') {
    return NextResponse.json({ error: 'vote must be "up" or "down"' }, { status: 400 })
  }
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) {
    return NextResponse.json({ error: 'Valid sessionId required' }, { status: 400 })
  }
  if (comment && typeof comment === 'string' && comment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comment too long (max ${MAX_COMMENT_LENGTH} characters)` },
      { status: 400 },
    )
  }

  const counts = await saveFeedback(
    { targetType, targetId, vote, comment: comment || undefined, sessionId },
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
