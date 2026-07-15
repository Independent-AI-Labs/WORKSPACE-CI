import { NextResponse } from 'next/server'
import {
  checkGrafanaHealth,
  resolveGrafanaBaseUrl,
  resolveGrafanaHealthUrlForServerProbe,
} from '@/lib/grafana-url'

export const dynamic = 'force-dynamic'

export async function GET() {
  const base = await resolveGrafanaBaseUrl()
  const probeUrl = resolveGrafanaHealthUrlForServerProbe(base)
  const healthy = await checkGrafanaHealth(probeUrl)
  return NextResponse.json({ ok: healthy }, { status: healthy ? 200 : 503 })
}