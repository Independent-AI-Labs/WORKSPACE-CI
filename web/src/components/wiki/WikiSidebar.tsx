'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import type { WikiStats } from '@/lib/search-data'
import { useSidebarStore } from '@/stores/sidebar-store'

interface NavItem {
  href: string
  label: string
  icon: string
  logo?: boolean
  count?: keyof WikiStats
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: 'ri-home-4-line' },
  { href: '/hooks', label: 'Git Hooks', icon: 'ri-link-m', count: 'hooks' },
  { href: '/runtime-hooks', label: 'Runtime Hooks', icon: 'ri-pulse-line' },
  { href: '/patterns', label: 'Code Anti-Patterns', icon: '', logo: true, count: 'patterns' },
  { href: '/config', label: 'Config Files', icon: 'ri-settings-3-line', count: 'configs' },
  { href: '/tooling', label: 'Tools & Scripts', icon: 'ri-tools-line', count: 'scripts' },
  { href: '/guard', label: 'Guard Policies', icon: 'ri-shield-keyhole-line', count: 'guards' },
  { href: '/llm-gateway', label: 'LLM Gateway', icon: 'ri-router-line' },
  { href: '/checks', label: 'Static Analysis', icon: 'ri-check-double-line' },
  { href: '/playground', label: 'Playground', icon: 'ri-code-box-line' },
  { href: '/standards', label: 'Standards & Regulations', icon: 'ri-book-marked-line', count: 'standards' },
  { href: '/integration', label: 'Integration Guide', icon: 'ri-plug-line' },
]

function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

interface WikiSidebarProps {
  stats: WikiStats
}

export function WikiSidebar({ stats }: WikiSidebarProps) {
  const pathname = usePathname()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const toggle = useSidebarStore((s) => s.toggle)

  return (
    <nav id="wiki-sidebar" className="wiki-sidebar" role="navigation" aria-label="Wiki navigation">
      <div className="wiki-sidebar__header">
        <img src="/LOGO.png" className="wiki-sidebar__logo" alt="workspaceguardrails logo" width="32" height="30" />
        <span className="wiki-sidebar__title">
          <span className="wiki-sidebar__title-thin">workspace</span>guardrails
        </span>
        <button
          type="button"
          className="wiki-sidebar__toggle"
          onClick={toggle}
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
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx('wiki-sidebar__link', isActive && 'is-active')}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
              >
                {item.logo ? (
                  <span className="wiki-sidebar__nav-logo" aria-hidden="true" />
                ) : (
                  <i className={item.icon} aria-hidden="true" />
                )}
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
