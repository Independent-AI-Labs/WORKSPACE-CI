import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  DEV_GRAFANA_BASE_URL,
  appendGrafanaEmbedParams,
  buildGrafanaDashboardUrl,
  checkGrafanaHealth,
  checkGrafanaHealthViaApi,
  GRAFANA_HEALTH_API_PATH,
  normalizeGrafanaDashboardSource,
  resolveGrafanaBaseUrl,
  resolveGrafanaBaseUrlFromEnv,
  resolveGrafanaBaseUrlSync,
  resolveGrafanaDashboards,
  resolveGrafanaHealthUrl,
  resolveGrafanaHealthUrlForServerProbe,
} from '@/lib/grafana-url'

describe('normalizeGrafanaDashboardSource', () => {
  it('reads path and query from yaml fields', () => {
    const out = normalizeGrafanaDashboardSource({
      title: 'LEADERBOARD',
      path: '/d/gateway-cost-leaderboard/x',
      query: 'orgId=1&from=now-7d',
    })
    expect(out).toEqual({ path: '/d/gateway-cost-leaderboard/x', query: 'orgId=1&from=now-7d' })
  })

  it('parses legacy url field', () => {
    const out = normalizeGrafanaDashboardSource({
      title: 'LEADERBOARD',
      url: 'http://localhost:3030/d/gateway-cost-leaderboard/x?orgId=1&from=now-24h',
    })
    expect(out).toEqual({
      path: '/d/gateway-cost-leaderboard/x',
      query: 'orgId=1&from=now-24h',
    })
  })
})

describe('buildGrafanaDashboardUrl', () => {
  it('joins dev base with dashboard path', () => {
    expect(
      buildGrafanaDashboardUrl(DEV_GRAFANA_BASE_URL, '/d/gateway-cost-usage/y', 'orgId=1'),
    ).toBe('http://127.0.0.1:3030/d/gateway-cost-usage/y?orgId=1')
  })

  it('joins prod subpath base with dashboard path', () => {
    expect(
      buildGrafanaDashboardUrl(
        'https://workspaceguardrails.com/grafana',
        '/d/gateway-cost-usage/y',
        'orgId=1',
      ),
    ).toBe('https://workspaceguardrails.com/grafana/d/gateway-cost-usage/y?orgId=1')
  })
})

describe('resolveGrafanaBaseUrlFromEnv', () => {
  afterEach(() => {
    delete process.env.GRAFANA_BASE_URL
  })

  it('returns null when unset or empty', () => {
    delete process.env.GRAFANA_BASE_URL
    expect(resolveGrafanaBaseUrlFromEnv()).toBeNull()
    process.env.GRAFANA_BASE_URL = ''
    expect(resolveGrafanaBaseUrlFromEnv()).toBeNull()
  })

  it('returns env value when valid', () => {
    process.env.GRAFANA_BASE_URL = 'https://workspaceguardrails.com/grafana'
    expect(resolveGrafanaBaseUrlFromEnv()).toBe('https://workspaceguardrails.com/grafana')
  })
})

describe('resolveGrafanaBaseUrlSync', () => {
  afterEach(() => {
    delete process.env.GRAFANA_BASE_URL
  })

  it('defaults to dev wiki /grafana proxy when env unset', () => {
    expect(resolveGrafanaBaseUrlSync()).toBe('http://127.0.0.1:4000/grafana')
  })
})

describe('resolveGrafanaDashboards', () => {
  it('builds urls from path+query sources', () => {
    const out = resolveGrafanaDashboards(
      [
        {
          title: 'LEADERBOARD',
          path: '/d/gateway-cost-leaderboard/x',
          query: 'orgId=1',
        },
      ],
      'https://127.0.0.1/grafana',
    )
    expect(out[0].url).toBe('https://127.0.0.1/grafana/d/gateway-cost-leaderboard/x?orgId=1')
  })
})

describe('resolveGrafanaBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('normalizes direct :3030 env base to /grafana subpath', async () => {
    vi.stubEnv('GRAFANA_BASE_URL', 'http://127.0.0.1:3030')
    const { resolveGrafanaBaseUrl: resolve } = await import('@/lib/grafana-url')
    expect(await resolve()).toBe('http://127.0.0.1:3030/grafana')
  })
})

describe('appendGrafanaEmbedParams', () => {
  it('adds theme and kiosk without duplicating kiosk', () => {
    const src =
      'https://workspaceguardrails.com/grafana/d/x/y?orgId=1&kiosk=true&theme=light'
    const out = appendGrafanaEmbedParams(src, 'dark')
    const u = new URL(out)
    expect(u.searchParams.get('theme')).toBe('dark')
    expect(u.searchParams.getAll('kiosk')).toEqual(['true'])
    expect(u.searchParams.get('orgId')).toBe('1')
    expect(u.searchParams.get('from')).toBe('now-30d')
    expect(u.searchParams.get('to')).toBe('now')
  })

  it('preserves existing time range params', () => {
    const src =
      'https://workspaceguardrails.com/grafana/d/x/y?orgId=1&from=now-7d&to=now-1h'
    const out = appendGrafanaEmbedParams(src, 'dark')
    const u = new URL(out)
    expect(u.searchParams.get('from')).toBe('now-7d')
    expect(u.searchParams.get('to')).toBe('now-1h')
  })
})

describe('resolveGrafanaHealthUrl', () => {
  it('appends api/health to dev loopback base', () => {
    expect(resolveGrafanaHealthUrl(DEV_GRAFANA_BASE_URL)).toBe(
      'http://127.0.0.1:3030/api/health',
    )
  })

  it('appends api/health to prod subpath base', () => {
    expect(resolveGrafanaHealthUrl('https://127.0.0.1/grafana')).toBe(
      'https://127.0.0.1/grafana/api/health',
    )
  })
})

describe('resolveGrafanaHealthUrlForServerProbe', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env.GRAFANA_INTERNAL_HEALTH_URL
  })

  it('uses internal env override when set', () => {
    process.env.GRAFANA_INTERNAL_HEALTH_URL = 'http://gw-grafana:3000/api/health'
    expect(resolveGrafanaHealthUrlForServerProbe('https://127.0.0.1/grafana')).toBe(
      'http://gw-grafana:3000/api/health',
    )
  })

  it('uses gw-grafana in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(resolveGrafanaHealthUrlForServerProbe('https://127.0.0.1/grafana')).toBe(
      'http://gw-grafana:3000/api/health',
    )
  })

  it('uses loopback gateway health outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(resolveGrafanaHealthUrlForServerProbe('http://127.0.0.1:4000/grafana')).toBe(
      'http://127.0.0.1:3030/api/health',
    )
  })
})

describe('checkGrafanaHealth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when fetch succeeds with ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true }),
    )
    await expect(checkGrafanaHealth('http://127.0.0.1:3030/api/health')).resolves.toBe(true)
  })

  it('returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    await expect(checkGrafanaHealth('http://127.0.0.1:3030/api/health')).resolves.toBe(false)
  })

  it('returns false when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false }),
    )
    await expect(checkGrafanaHealth('http://127.0.0.1:3030/api/health')).resolves.toBe(false)
  })
})

describe('checkGrafanaHealthViaApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('probes the same-origin api route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkGrafanaHealthViaApi()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      GRAFANA_HEALTH_API_PATH,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
  })
})