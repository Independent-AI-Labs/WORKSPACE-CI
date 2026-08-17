import { NextResponse } from 'next/server'
import { createRelayClient } from '@/lib/relay-client'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    request_id?: string
    request_hash?: string
    decision?: 'approve' | 'deny'
  }

  if (
    typeof body.request_id !== 'string' ||
    body.request_id.length === 0 ||
    typeof body.request_hash !== 'string' ||
    body.request_hash.length === 0 ||
    (body.decision !== 'approve' && body.decision !== 'deny')
  ) {
    return NextResponse.json(
      { error: 'invalid decision request' },
      { status: 400 },
    )
  }

  const client = createRelayClient()
  const result = await client.submitDecision(
    body.request_id,
    body.request_hash,
    body.decision,
  )

  return NextResponse.json(result)
}
