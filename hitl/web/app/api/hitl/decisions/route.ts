import { NextResponse } from 'next/server'
import { createRelayClient } from '@/lib/relay-client'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    request_id?: string
    decision?: 'approve' | 'deny'
  }

  const client = createRelayClient()
  const result = await client.submitDecision(
    String(body.request_id ?? ''),
    body.decision ?? 'deny',
  )

  return NextResponse.json(result)
}
