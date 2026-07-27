import { NextResponse } from 'next/server'
import { createRelayClient } from '@/lib/relay-client'

export async function POST() {
  const client = createRelayClient()
  const ticket = await client.mintWsTicket()
  return NextResponse.json(ticket)
}
