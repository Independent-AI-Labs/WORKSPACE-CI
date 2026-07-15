import type { WikiStats } from '@/lib/search-data'

export interface WikiNavItem {
  href: string
  label: string
  icon: string
  count?: keyof WikiStats
  divider?: boolean
}

export const HOME_NAV_ITEM: WikiNavItem = { href: '/', label: 'Home', icon: 'ri-home-line' }

export const WIKI_NAV_ITEMS: WikiNavItem[] = [
  { href: '/projects', label: 'Open Source', icon: 'ri-dna-line', count: 'projects' },
  { href: '/hooks', label: 'Git Hooks', icon: 'ri-git-commit-line', count: 'hooks' },
  { href: '/runtime-hooks', label: 'Runtime Hooks', icon: 'ri-pulse-line', count: 'runtimeHooks' },
  { href: '/patterns', label: 'Code Anti-Patterns', icon: 'ri-error-warning-line', count: 'patterns' },
  { href: '/config', label: 'Config Files', icon: 'ri-settings-3-line', count: 'configs' },
  { href: '/tooling', label: 'Tools & Scripts', icon: 'ri-tools-line', count: 'scripts' },
  { href: '/guard', label: 'Guard Policies', icon: 'ri-shield-keyhole-line', count: 'guards' },
  { href: '/standards', label: 'AI Governance', icon: 'ri-book-marked-line', count: 'standards' },
  { href: '/llm-gateway', label: 'LLM Gateway', icon: 'ri-globe-line', divider: true },
  { href: '/checks', label: 'Static Analysis', icon: 'ri-check-double-line' },
  { href: '/playground', label: 'Playground', icon: 'ri-code-box-line' },
  { href: '/integration', label: 'Integration Guide', icon: 'ri-plug-line', divider: true },
]

const NAV_LABEL_BY_HREF = new Map<string, string>(
  [HOME_NAV_ITEM, ...WIKI_NAV_ITEMS].map((item) => [item.href, item.label]),
)

export function getNavLabelForHref(href: string): string | undefined {
  return NAV_LABEL_BY_HREF.get(href)
}