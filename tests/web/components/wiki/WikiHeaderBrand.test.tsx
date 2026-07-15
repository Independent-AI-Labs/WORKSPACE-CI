import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WikiHeaderBrand } from '@/components/wiki/WikiHeaderBrand'
import type { Branding } from '@/lib/branding'

const branding: Branding = {
  name: 'Test',
  sidebar_title_thin: 'workspace',
  sidebar_title_bold: 'guardrails',
  logo_path: '/LOGO.png',
  logo_path_dark: '/LOGO_DARK_THEME.png',
  logo_path_light: '/LOGO_LIGHT_THEME.png',
  metadata_title: 'Test',
  metadata_description: 'Test',
  footer_tagline: 'Test',
  footer_copyright: 'Test',
  contact_email: 'test@example.com',
  grafana_dashboards: [],
  grafana_subtitle: 'Test',
  standards_page_intro: 'Test',
  contact_button_label: 'Contact',
  contact_modal_title_template: 'Contact {name}',
  contact_body_template: 'Body',
  contact_instruction: 'Instruction',
  contact_alt_purchase: 'Purchase',
  contact_issuer_store_template: 'Store',
}

describe('WikiHeaderBrand', () => {
  it('links to home when landing is enabled', () => {
    render(<WikiHeaderBrand branding={branding} homeLandingEnabled />)
    expect(screen.getByRole('link', { name: /workspaceguardrails logo/i })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('links to projects when landing is disabled', () => {
    render(<WikiHeaderBrand branding={branding} homeLandingEnabled={false} />)
    expect(screen.getByRole('link', { name: /workspaceguardrails logo/i })).toHaveAttribute(
      'href',
      '/projects',
    )
  })
})