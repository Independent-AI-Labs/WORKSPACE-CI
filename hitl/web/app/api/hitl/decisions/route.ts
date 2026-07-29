import { NextResponse } from 'next/server'
import { createRelayClient } from '@/lib/relay-client'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    request_id?: string
    decision?: 'approve' | 'deny'
  }

  if (
    typeof body.request_id !== 'string' ||
    body.request_id.length === 0 ||
    (body.decision !== 'approve' && body.decision !== 'deny')
  ) {
    return NextResponse.json(
      { error: 'invalid request: request_id and decision (approve|deny) are required' },
      { status: 400 },
    )
  }

  const client = createRelayClient()
  const result = await client.submitDecision(body.request_id, body.decision)

  return NextResponse.json(result)
}
