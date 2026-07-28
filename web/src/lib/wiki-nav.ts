import type { WikiStats } from '@/lib/search-data'
import wikiNavData from '@/data/wiki-nav.json'

export interface WikiNavItem {
  href: string
  label: string
  icon: string
  count?: keyof WikiStats
  divider?: boolean
}

interface WikiNavData {
  version: number
  items: Array<{
    href: string
    label: string
    icon: string
    count?: string
    divider?: boolean
  }>
}

const data = wikiNavData as WikiNavData

const ALL_NAV_ITEMS: WikiNavItem[] = data.items.map((item) => ({
  href: item.href,
  label: item.label,
  icon: item.icon,
  ...(item.count ? { count: item.count as keyof WikiStats } : {}),
  ...(item.divider ? { divider: true } : {}),
}))

export const HOME_NAV_ITEM: WikiNavItem = ALL_NAV_ITEMS[0] ?? {
  href: '/',
  label: 'Home',
  icon: 'ri-home-line',
}

export const WIKI_NAV_ITEMS: WikiNavItem[] = ALL_NAV_ITEMS.slice(1)

const NAV_LABEL_BY_HREF = new Map<string, string>(
  ALL_NAV_ITEMS.map((item) => [item.href, item.label])
)

export function getNavLabelForHref(href: string): string | undefined {
  return NAV_LABEL_BY_HREF.get(href)
}
