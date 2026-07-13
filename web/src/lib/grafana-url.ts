export const DEV_GRAFANA_BASE_URL = 'http://127.0.0.1:3030'

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

export function normalizeGrafanaDashboardSource(
  raw: GrafanaDashboardSource,
): { path: string; query: string } {
  if (raw.path) {
    const path = raw.path.startsWith('/') ? raw.path : `/${raw.path}`
    return { path, query: raw.query ?? '' }
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
    `${parsedBase.protocol}//${parsedBase.host}`,
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

export async function resolveGrafanaBaseUrl(): Promise<string> {
  const fromEnv = resolveGrafanaBaseUrlFromEnv()
  if (fromEnv) return fromEnv

  if (process.env.NODE_ENV === 'production') {
    const { headers } = await import('next/headers')
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    const proto = h.get('x-forwarded-proto') ?? 'https'
    if (host) {
      const primaryHost = host.split(',')[0].trim()
      return `${proto}://${primaryHost}/grafana`
    }
  }

  return DEV_GRAFANA_BASE_URL
}

export function resolveGrafanaBaseUrlSync(): string {
  return resolveGrafanaBaseUrlFromEnv() ?? DEV_GRAFANA_BASE_URL
}

export function resolveGrafanaDashboards(
  sources: GrafanaDashboardSource[],
  base: string,
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
  return u.toString()
}