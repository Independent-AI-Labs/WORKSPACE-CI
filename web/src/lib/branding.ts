import { cache } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import {
  type GrafanaDashboardConfig,
  type GrafanaDashboardSource,
  resolveGrafanaBaseUrl,
  resolveGrafanaBaseUrlFromEnv,
  resolveGrafanaBaseUrlSync,
  resolveGrafanaDashboards,
  DEV_GRAFANA_BASE_URL,
  normalizeGrafanaPublicBase,
} from '@/lib/grafana-url'

export type { GrafanaDashboardConfig } from '@/lib/grafana-url'

export interface Branding {
  name: string
  sidebar_title_thin: string
  sidebar_title_bold: string
  logo_path: string
  logo_path_dark: string
  logo_path_light: string
  metadata_title: string
  metadata_description: string
  footer_tagline: string
  footer_copyright: string
  contact_email: string
  grafana_dashboards: GrafanaDashboardConfig[]
  grafana_subtitle: string
  standards_page_intro: string
  contact_button_label: string
  contact_modal_title_template: string
  contact_body_template: string
  contact_instruction: string
  contact_alt_purchase: string
  contact_issuer_store_template: string
}

const BRANDING_PATH = join(process.cwd(), 'branding.yaml')

type RawBranding = Omit<Branding, 'grafana_dashboards'> & {
  grafana_dashboards: GrafanaDashboardSource[]
}

function loadRawBranding(): RawBranding {
  const raw = readFileSync(BRANDING_PATH, 'utf8')
  return load(raw) as RawBranding
}

export function applyGrafanaBaseUrl(branding: Branding, base?: string): Branding {
  const envBase = resolveGrafanaBaseUrlFromEnv()
  const resolvedBase = base ?? envBase
  if (!resolvedBase) {
    return branding
  }
  let normalizedBase: string
  try {
    normalizedBase = normalizeGrafanaPublicBase(resolvedBase)
  } catch {
    return branding
  }

  const sources: GrafanaDashboardSource[] = branding.grafana_dashboards.map((d) => ({
    title: d.title,
    url: d.url,
  }))
  return {
    ...branding,
    grafana_dashboards: resolveGrafanaDashboards(sources, normalizedBase),
  }
}

function brandingWithGrafanaSources(sources: GrafanaDashboardSource[]): Branding {
  const raw = loadRawBranding()
  const base = resolveGrafanaBaseUrlSync()
  return {
    ...raw,
    grafana_dashboards: resolveGrafanaDashboards(sources, base),
  }
}

export const getBranding = cache((): Branding => {
  const raw = loadRawBranding()
  return brandingWithGrafanaSources(raw.grafana_dashboards)
})

export async function getBrandingForRequest(): Promise<Branding> {
  const raw = loadRawBranding()
  const base = await resolveGrafanaBaseUrl()
  return {
    ...raw,
    grafana_dashboards: resolveGrafanaDashboards(raw.grafana_dashboards, base),
  }
}

export { DEV_GRAFANA_BASE_URL }