import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  DEV_GRAFANA_BASE_URL,
  appendGrafanaEmbedParams,
  buildGrafanaDashboardUrl,
  normalizeGrafanaDashboardSource,
  resolveGrafanaBaseUrl,
  resolveGrafanaBaseUrlFromEnv,
  resolveGrafanaBaseUrlSync,
  resolveGrafanaDashboards,
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

  it('defaults to dev loopback when env unset', () => {
    expect(resolveGrafanaBaseUrlSync()).toBe(DEV_GRAFANA_BASE_URL)
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
    delete process.env.GRAFANA_BASE_URL
    delete process.env.NODE_ENV
  })

  it('uses dev default outside production when env unset', async () => {
    process.env.NODE_ENV = 'development'
    expect(await resolveGrafanaBaseUrl()).toBe(DEV_GRAFANA_BASE_URL)
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
  })
})