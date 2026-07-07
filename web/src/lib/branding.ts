import { cache } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'

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
  grafana_url: string
  grafana_dashboard_title: string
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

export const getBranding = cache((): Branding => {
  const raw = readFileSync(BRANDING_PATH, 'utf8')
  return load(raw) as Branding
})
