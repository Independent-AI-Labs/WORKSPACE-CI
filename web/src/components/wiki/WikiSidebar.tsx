'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import type { WikiStats } from '@/lib/search-data'
import type { Branding } from '@/lib/branding'
import { useSidebarStore } from '@/stores/sidebar-store'
import { ThemeLogo } from './ThemeLogo'

interface NavItem {
  href: string
  label: string
  icon: string
  count?: keyof WikiStats
  divider?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Guardrail Ecosystem', icon: 'ri-dna-line' },
  { href: '/hooks', label: 'Git Hooks', icon: 'ri-git-commit-line', count: 'hooks' },
  { href: '/runtime-hooks', label: 'Runtime Hooks', icon: 'ri-pulse-line', count: 'runtimeHooks' },
  { href: '/patterns', label: 'Code Anti-Patterns', icon: 'ri-error-warning-line', count: 'patterns' },
  { href: '/config', label: 'Config Files', icon: 'ri-settings-3-line', count: 'configs' },
  { href: '/tooling', label: 'Tools & Scripts', icon: 'ri-tools-line', count: 'scripts' },
  { href: '/guard', label: 'Guard Policies', icon: 'ri-shield-keyhole-line', count: 'guards' },
  { href: '/standards', label: 'Standards & Regulation', icon: 'ri-book-marked-line', count: 'standards' },
  { href: '/llm-gateway', label: 'LLM Gateway', icon: 'ri-router-line', divider: true },
  { href: '/checks', label: 'Static Analysis', icon: 'ri-check-double-line' },
  { href: '/playground', label: 'Playground', icon: 'ri-code-box-line' },
  { href: '/integration', label: 'Integration Guide', icon: 'ri-plug-line', divider: true },
]

function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

interface WikiSidebarProps {
  stats: WikiStats
  branding: Branding
}

export function WikiSidebar({ stats, branding }: WikiSidebarProps) {
  const pathname = usePathname()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)
  const toggle = useSidebarStore((s) => s.toggle)

  return (
    <nav id="wiki-sidebar" className={clsx('wiki-sidebar', mobileOpen && 'is-open')} role="navigation" aria-label="Wiki navigation">
      <div className="wiki-sidebar__header">
        <ThemeLogo
          src={branding.logo_path}
          className="wiki-sidebar__logo"
          alt={`${branding.sidebar_title_thin}${branding.sidebar_title_bold} logo`}
          colorVar="var(--text)"
        />
        <span className="wiki-sidebar__title">
          <span className="wiki-sidebar__title-thin">{branding.sidebar_title_thin}</span>{branding.sidebar_title_bold}
        </span>
        <button
          type="button"
          className="wiki-sidebar__toggle"
          onClick={() => {
            if (mobileOpen) {
              setMobileOpen(false)
            } else {
              toggle()
            }
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <i className={collapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line'} aria-hidden="true" />
        </button>
      </div>
      <ul className="wiki-sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const isActive = isPathActive(pathname, item.href)
          const count = item.count ? stats[item.count] : undefined
          return (
            <li key={item.href} className={clsx(item.divider && 'wiki-sidebar__divider')}>
              <Link
                href={item.href}
                className={clsx('wiki-sidebar__link', isActive && 'is-active')}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                onClick={() => setMobileOpen(false)}
              >
                <i className={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
                {count !== undefined && (
                  <span className="wiki-sidebar__count">[{count}]</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
