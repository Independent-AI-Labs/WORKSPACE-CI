export const GRAFANA_HEALTH_API_PATH = '/api/grafana/health'

export interface GrafanaDashboardSource {
  title: string
  url?: string
  path?: string
  query?: string
}

export interface GrafanaDashboardConfig {
  title: string
  url: string
}

export function normalizeGrafanaDashboardSource(raw: GrafanaDashboardSource): {
  path: string
  query: string
} {
  if (raw.path) {
    const path = raw.path.startsWith('/') ? raw.path : `/${raw.path}`
    return { path, query: raw.query === undefined ? '' : raw.query }
  }
  if (raw.url) {
    const u = new URL(raw.url)
    return { path: u.pathname, query: u.search.slice(1) }
  }
  throw new Error(`Grafana dashboard "${raw.title}" must define path or url`)
}

export function buildGrafanaDashboardUrl(base: string, path: string, query: string): string {
  const parsedBase = new URL(base.endsWith('/') ? base : `${base}/`)
  const basePath = parsedBase.pathname.replace(/\/$/, '')
  const suffix = query ? `?${query}` : ''
  return new URL(
    `${basePath}${path}${suffix}`,
    `${parsedBase.protocol}//${parsedBase.host}`
  ).toString()
}

export function resolveGrafanaBaseUrlFromEnv(): string | null {
  const base = process.env.GRAFANA_BASE_URL
  if (!base || base.trim() === '') return null
  try {
    new URL(base.endsWith('/') ? base : `${base}/`)
    return base
  } catch (err) {
    console.warn(`[grafana-url] ignoring invalid GRAFANA_BASE_URL: ${base}`, err)
    return null
  }
}

export function normalizeGrafanaPublicBase(base: string): string {
  const parsed = new URL(base.endsWith('/') ? base : `${base}/`)
  const path = parsed.pathname.replace(/\/$/, '')

  // Direct :3030 without /grafana hits GF_SERVER_ROOT_URL redirects to production.
  if (parsed.port === '3030' && path !== '/grafana') {
    return `${parsed.protocol}//${parsed.host}/grafana`
  }
  return base.replace(/\/$/, '')
}

export async function resolveGrafanaBaseUrl(): Promise<string> {
  const fromEnv = resolveGrafanaBaseUrlFromEnv()
  if (fromEnv) return normalizeGrafanaPublicBase(fromEnv)

  const { headers } = await import('next/headers')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const primaryHost = host.split(',')[0].trim()
    const proto =
      h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    return `${proto}://${primaryHost}/grafana`
  }

  return `http://127.0.0.1:${requireWikiDevPort()}/grafana`
}

function requireWikiDevPort(): string {
  const devPort = process.env.WIKI_DEV_PORT
  if (devPort === undefined || devPort.trim() === '') {
    throw new Error('WIKI_DEV_PORT env var is required to resolve the dev Grafana base URL')
  }
  return devPort
}

export function resolveGrafanaBaseUrlSync(): string {
  const fromEnv = resolveGrafanaBaseUrlFromEnv()
  if (fromEnv) return normalizeGrafanaPublicBase(fromEnv)
  const devPort = requireWikiDevPort()
  if (process.env.NODE_ENV === 'production') {
    return 'https://127.0.0.1/grafana'
  }
  return `http://127.0.0.1:${devPort}/grafana`
}

export function resolveGrafanaDashboards(
  sources: GrafanaDashboardSource[],
  base: string
): GrafanaDashboardConfig[] {
  return sources.map((raw) => {
    const { path, query } = normalizeGrafanaDashboardSource(raw)
    return {
      title: raw.title,
      url: buildGrafanaDashboardUrl(base, path, query),
    }
  })
}

export function appendGrafanaEmbedParams(src: string, theme: string): string {
  const u = new URL(src)
  u.searchParams.set('theme', theme)
  u.searchParams.set('kiosk', 'true')
  if (!u.searchParams.has('from')) {
    u.searchParams.set('from', 'now-30d')
  }
  if (!u.searchParams.has('to')) {
    u.searchParams.set('to', 'now')
  }
  return u.toString()
}

export function resolveGrafanaHealthUrl(base: string): string {
  const parsedBase = new URL(base.endsWith('/') ? base : `${base}/`)
  const basePath = parsedBase.pathname.replace(/\/$/, '')
  return new URL(`${basePath}/api/health`, `${parsedBase.protocol}//${parsedBase.host}`).toString()
}

/** Server-side probe URL (container DNS). Browser embeds use resolveGrafanaHealthUrl. */
export function resolveGrafanaHealthUrlForServerProbe(publicBase: string): string | null {
  void publicBase
  const internal = process.env.GRAFANA_INTERNAL_HEALTH_URL?.trim()
  if (internal) return internal
  if (process.env.NODE_ENV === 'production') {
    return 'http://gw-grafana:3000/api/health'
  }
  const devUpstream = getDevGrafanaUpstream()
  if (devUpstream === null) return null
  return `${devUpstream}/api/health`
}

/** Explicit dev Grafana upstream for this application instance (GRAFANA_DEV_UPSTREAM). */
export function getDevGrafanaUpstream(): string | null {
  const upstream = process.env.GRAFANA_DEV_UPSTREAM?.trim()
  if (upstream === undefined || upstream === '') return null
  return upstream
}

export async function checkGrafanaHealth(healthUrl: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch (err) {
    console.warn(`[grafana-url] health probe failed for ${healthUrl}`, err)
    return false
  }
}

/** Browser-safe probe via same-origin Next.js route (avoids cross-origin CORS in dev). */
export async function checkGrafanaHealthViaApi(
  apiPath = GRAFANA_HEALTH_API_PATH,
  timeoutMs = 3000
): Promise<boolean> {
  try {
    const res = await fetch(apiPath, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch (err) {
    console.warn(`[grafana-url] health API probe failed for ${apiPath}`, err)
    return false
  }
}
