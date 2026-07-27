import { NextResponse } from 'next/server'
import { createRelayClient } from '@/lib/relay-client'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const client = createRelayClient()
  const item = await client.getRequest(id)

  if (!item) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json(item)
}
