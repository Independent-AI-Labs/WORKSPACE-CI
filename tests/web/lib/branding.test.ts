import { describe, it, expect, afterEach } from 'vitest'
import { applyGrafanaBaseUrl, type Branding } from '@/lib/branding'

function baseBranding(): Branding {
  return {
    name: 'Digital and AI Workspace Guardrails',
    sidebar_title_thin: 'workspace',
    sidebar_title_bold: 'guardrails',
    logo_path: '/LOGO.png',
    logo_path_dark: '/LOGO_DARK_THEME.png',
    logo_path_light: '/LOGO_LIGHT_THEME.png',
    metadata_title: 'Workspace Guardrails',
    metadata_description: 'Interactive wiki for workspace-ci',
    footer_tagline: 'The Digital and AI Workspace Guardrails Wiki',
    footer_copyright: '2026 Independent AI Labs',
    contact_email: 'independentailabs@gmail.com',
    grafana_dashboards: [
      {
        title: 'LEADERBOARD',
        url: 'http://localhost:3030/d/gateway-cost-leaderboard/x?orgId=1&from=now-24h&to=now',
      },
      {
        title: 'USAGE & COSTS',
        url: 'http://localhost:3030/d/gateway-cost-usage/y?orgId=1&var-model=$__all',
      },
    ],
    grafana_subtitle: 'Real-time metrics',
    standards_page_intro: 'Curated catalogue',
    contact_button_label: 'Contact for Access',
    contact_modal_title_template: 'Obtaining {title}',
    contact_body_template: '{title} is a paid standard from {issuer}.',
    contact_instruction: 'For inquiries, contact:',
    contact_alt_purchase: 'Or purchase directly from the issuer:',
    contact_issuer_store_template: '{issuer} Store',
  }
}

describe('applyGrafanaBaseUrl', () => {
  afterEach(() => {
    delete process.env.GRAFANA_BASE_URL
  })

  it('returns dashboards unchanged when env var is unset and no base passed', () => {
    delete process.env.GRAFANA_BASE_URL
    const out = applyGrafanaBaseUrl(baseBranding())
    expect(out.grafana_dashboards.map((d) => d.url)).toEqual([
      'http://localhost:3030/d/gateway-cost-leaderboard/x?orgId=1&from=now-24h&to=now',
      'http://localhost:3030/d/gateway-cost-usage/y?orgId=1&var-model=$__all',
    ])
  })

  it('rewrites path+query sources when an explicit base is passed', () => {
    const branding = baseBranding()
    branding.grafana_dashboards = [
      {
        title: 'LEADERBOARD',
        url: 'http://ignored/d/gateway-cost-leaderboard/x?orgId=1',
      },
    ]
    const out = applyGrafanaBaseUrl(branding, 'https://127.0.0.1/grafana')
    expect(out.grafana_dashboards[0].url).toBe(
      'https://127.0.0.1/grafana/d/gateway-cost-leaderboard/x?orgId=1',
    )
  })

  it('returns dashboards unchanged when env var is empty', () => {
    process.env.GRAFANA_BASE_URL = ''
    const out = applyGrafanaBaseUrl(baseBranding())
    expect(out.grafana_dashboards[0].url).toContain('localhost:3030')
  })

  it('rewrites the host while preserving path and query string', () => {
    process.env.GRAFANA_BASE_URL = 'http://192.168.50.63:3030'
    const out = applyGrafanaBaseUrl(baseBranding())
    expect(out.grafana_dashboards.map((d) => d.url)).toEqual([
      'http://192.168.50.63:3030/grafana/d/gateway-cost-leaderboard/x?orgId=1&from=now-24h&to=now',
      'http://192.168.50.63:3030/grafana/d/gateway-cost-usage/y?orgId=1&var-model=$__all',
    ])
  })

  it('supports https base with a different port', () => {
    process.env.GRAFANA_BASE_URL = 'https://grafana.example:4433/'
    const out = applyGrafanaBaseUrl(baseBranding())
    expect(out.grafana_dashboards[0].url).toBe(
      'https://grafana.example:4433/d/gateway-cost-leaderboard/x?orgId=1&from=now-24h&to=now',
    )
  })

  it('prepends a subpath when the base URL includes a pathname', () => {
    process.env.GRAFANA_BASE_URL = 'https://workspaceguardrails.com/grafana'
    const out = applyGrafanaBaseUrl(baseBranding())
    expect(out.grafana_dashboards.map((d) => d.url)).toEqual([
      'https://workspaceguardrails.com/grafana/d/gateway-cost-leaderboard/x?orgId=1&from=now-24h&to=now',
      'https://workspaceguardrails.com/grafana/d/gateway-cost-usage/y?orgId=1&var-model=$__all',
    ])
  })

  it('leaves dashboards untouched when the env var is not a valid URL', () => {
    process.env.GRAFANA_BASE_URL = 'not-a-url'
    const out = applyGrafanaBaseUrl(baseBranding())
    expect(out.grafana_dashboards[0].url).toContain('localhost:3030')
  })

  it('does not mutate the input branding object', () => {
    process.env.GRAFANA_BASE_URL = 'http://192.168.50.63:3030'
    const input = baseBranding()
    const originalUrls = input.grafana_dashboards.map((d) => d.url)
    applyGrafanaBaseUrl(input)
    expect(input.grafana_dashboards.map((d) => d.url)).toEqual(originalUrls)
  })

  it('preserves non-dashboard fields', () => {
    process.env.GRAFANA_BASE_URL = 'http://192.168.50.63:3030'
    const input = baseBranding()
    const out = applyGrafanaBaseUrl(input)
    expect(out.name).toBe(input.name)
    expect(out.grafana_subtitle).toBe(input.grafana_subtitle)
    expect(out.sidebar_title_bold).toBe(input.sidebar_title_bold)
  })
})