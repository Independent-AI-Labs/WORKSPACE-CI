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
  if (probeUrl === null) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'GRAFANA_DEV_UPSTREAM is not set for this application instance; no dev health probe URL.',
      },
      { status: 503 },
    )
  }
  const healthy = await checkGrafanaHealth(probeUrl)
  return NextResponse.json({ ok: healthy }, { status: healthy ? 200 : 503 })
}