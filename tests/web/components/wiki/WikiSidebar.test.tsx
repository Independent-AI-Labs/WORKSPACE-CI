import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WikiSidebar } from '@/components/wiki/WikiSidebar'
import type { WikiStats } from '@/lib/search-data'
import type { Branding } from '@/lib/branding'

vi.mock('next/navigation', () => ({
  usePathname: () => '/patterns',
}))

const mockStats: WikiStats = {
  hooks: 20,
  patterns: 105,
  configs: 12,
  guards: 6,
  standards: 20,
  scripts: 12,
  runtimeHooks: 0,
}

const mockBranding: Branding = {
  name: 'Digital and AI Workspace Guardrails',
  sidebar_title_thin: 'workspace',
  sidebar_title_bold: 'guardrails',
  logo_path: '/LOGO.png',
  logo_path_dark: '/LOGO_DARK_THEME.png',
  logo_path_light: '/LOGO_LIGHT_THEME.png',
  metadata_title: 'Workspace Guardrails',
  metadata_description: 'Interactive wiki for workspace-ci',
  footer_tagline: 'The Digital and AI Workspace Guardrails Wiki',
  footer_copyright: '2026 ◆ Independent AI Labs',
  contact_email: 'independentailabs@gmail.com',
  grafana_dashboards: [
    { title: 'LEADERBOARD', url: 'http://localhost:3030/d/gateway-cost-leaderboard/leaderboard' },
    { title: 'USAGE & COSTS', url: 'http://localhost:3030/d/gateway-cost-usage/usage' },
    { title: 'OPERATIONS', url: 'http://localhost:3030/d/gateway-ops-health/ops' },
  ],
  grafana_subtitle: 'Real-time metrics',
  standards_page_intro: 'Curated catalogue of AI standards.',
  contact_button_label: 'Contact for Access',
  contact_modal_title_template: 'Obtaining {title}',
  contact_body_template: '{title} is a paid standard from {issuer}.',
  contact_instruction: 'For inquiries, contact:',
  contact_alt_purchase: 'Or purchase directly from the issuer:',
  contact_issuer_store_template: '{issuer} Store',
}

describe('WikiSidebar', () => {
  it('renders navigation links', () => {
    render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    expect(screen.getByText('Code Anti-Patterns')).toBeInTheDocument()
    expect(screen.getByText('Git Hooks')).toBeInTheDocument()
    expect(screen.getByText('Config Files')).toBeInTheDocument()
    expect(screen.getByText('Playground')).toBeInTheDocument()
  })

  it('highlights active route', () => {
    render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    const patternsLink = screen.getByText('Code Anti-Patterns').closest('a')
    expect(patternsLink).toHaveClass('is-active')
  })

  it('renders all nav items', () => {
    render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    expect(screen.getByText('Open Source')).toBeInTheDocument()
    expect(screen.getByText('Runtime Hooks')).toBeInTheDocument()
    expect(screen.getByText('Guard Policies')).toBeInTheDocument()
    expect(screen.getByText('LLM Gateway')).toBeInTheDocument()
    expect(screen.getByText('Static Analysis')).toBeInTheDocument()
    expect(screen.getByText('Tools & Scripts')).toBeInTheDocument()
    expect(screen.getByText('Integration Guide')).toBeInTheDocument()
  })

  it('renders counts in brackets for items with counts', () => {
    render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    expect(screen.getAllByText('[20]')).toHaveLength(2)
    expect(screen.getAllByText('[12]')).toHaveLength(2)
    expect(screen.getByText('[105]')).toBeInTheDocument()
    expect(screen.getByText('[6]')).toBeInTheDocument()
    expect(screen.getByText('[0]')).toBeInTheDocument()
  })

  it('renders [0] for Runtime Hooks', () => {
    render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    const runtimeHooksLink = screen.getByText('Runtime Hooks').closest('a')
    expect(runtimeHooksLink).toHaveTextContent('[0]')
  })

  it('renders collapse toggle button', () => {
    render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(toggle).toBeInTheDocument()
  })

  it('places AI Governance before LLM Gateway', () => {
    const { container } = render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    const links = container.querySelectorAll('.wiki-sidebar__link')
    const labels = Array.from(links).map((l) => l.textContent?.replace(/\[\d+\]/g, '').trim())
    const standardsIdx = labels.indexOf('AI Governance')
    const llmIdx = labels.indexOf('LLM Gateway')
    expect(standardsIdx).toBeGreaterThan(-1)
    expect(llmIdx).toBeGreaterThan(-1)
    expect(standardsIdx).toBeLessThan(llmIdx)
  })

  it('places AI Governance after Guard Policies', () => {
    const { container } = render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    const links = container.querySelectorAll('.wiki-sidebar__link')
    const labels = Array.from(links).map((l) => l.textContent?.replace(/\[\d+\]/g, '').trim())
    const standardsIdx = labels.indexOf('AI Governance')
    const guardIdx = labels.indexOf('Guard Policies')
    expect(standardsIdx).toBeGreaterThan(guardIdx)
  })

  it('renders globe icon on LLM Gateway nav item', () => {
    render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    const llmLink = screen.getByRole('link', { name: 'LLM Gateway' })
    expect(llmLink.querySelector('i.ri-globe-line')).toBeTruthy()
  })

  it('renders dividers around LLM Gateway, Static Analysis, and Playground group', () => {
    const { container } = render(<WikiSidebar stats={mockStats} branding={mockBranding} />)
    const items = Array.from(container.querySelectorAll('.wiki-sidebar__nav > li'))
    const labels = items.map((li) => {
      const link = li.querySelector('.wiki-sidebar__link')
      return link ? link.textContent || '' : ''
    })
    const llmIdx = labels.findIndex((l) => l.includes('LLM Gateway'))
    const integrationIdx = labels.findIndex((l) => l.includes('Integration Guide'))
    expect(items[llmIdx]).toHaveClass('wiki-sidebar__divider')
    expect(items[integrationIdx]).toHaveClass('wiki-sidebar__divider')
    const checksLi = items[labels.findIndex((l) => l.includes('Static Analysis'))]
    const playgroundLi = items[labels.findIndex((l) => l.includes('Playground'))]
    expect(checksLi).not.toHaveClass('wiki-sidebar__divider')
    expect(playgroundLi).not.toHaveClass('wiki-sidebar__divider')
  })
})
