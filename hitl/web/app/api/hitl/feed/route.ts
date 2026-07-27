import { NextResponse } from 'next/server'
import { createRelayClient } from '@/lib/relay-client'

export async function GET() {
  const client = createRelayClient()
  const items = await client.getFeed()
  return NextResponse.json({ items })
}
