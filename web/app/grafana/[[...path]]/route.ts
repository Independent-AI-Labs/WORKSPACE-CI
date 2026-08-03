import { type NextRequest, NextResponse } from 'next/server'
import { getDevGrafanaUpstream } from '@/lib/grafana-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function rewriteGrafanaLocation(location: string, origin: string): string | null {
  if (location.startsWith('/')) {
    const path = location.startsWith('/grafana') ? location : `/grafana${location}`
    return `${origin}${path}`
  }
  try {
    const loc = new URL(location)
    if (loc.pathname.startsWith('/grafana')) {
      return `${origin}${loc.pathname}${loc.search}`
    }
    return `${origin}/grafana${loc.pathname}${loc.search}`
  } catch (err) {
    console.warn(`[grafana-proxy] invalid Location header: ${location}`, err)
    return null
  }
}

async function proxyToGrafana(request: NextRequest, pathSegments: string[] | undefined) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Grafana is proxied by nginx in production' }, { status: 404 })
  }

  const devUpstream = getDevGrafanaUpstream()
  if (devUpstream === null) {
    return NextResponse.json(
      {
        error:
          'GRAFANA_DEV_UPSTREAM is not set for this application instance. Set it to the Grafana origin the dev proxy should forward to.',
      },
      { status: 503 },
    )
  }

  const incoming = new URL(request.url)
  const suffix = pathSegments === undefined ? '' : pathSegments.join('/')
  const targetPath = suffix ? `/grafana/${suffix}` : '/grafana'
  const targetUrl = `${devUpstream}${targetPath}${incoming.search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'host' || lower === 'connection' || lower === 'accept-encoding') return
    headers.set(key, value)
  })
  headers.set('X-WEBAUTH-USER', 'wiki-embed')
  headers.set('Accept-Encoding', 'identity')

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  const upstream = await fetch(targetUrl, init)
  const responseHeaders = new Headers(upstream.headers)
  // fetch() decompresses gzip bodies; drop encoding/length so the browser does not
  // attempt a second decode (ERR_CONTENT_DECODING_FAILED in iframe embeds).
  for (const hopByHop of ['connection', 'content-encoding', 'content-length', 'transfer-encoding']) {
    responseHeaders.delete(hopByHop)
  }

  const location = responseHeaders.get('location')
  if (location) {
    const rewritten = rewriteGrafanaLocation(location, incoming.origin)
    if (rewritten) responseHeaders.set('location', rewritten)
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

type RouteCtx = { params: Promise<{ path?: string[] }> }

async function handle(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params
  return proxyToGrafana(request, path)
}

export const GET = handle
export const HEAD = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const OPTIONS = handle