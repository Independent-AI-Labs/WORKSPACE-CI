'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

interface NavItem {
  href: string
  label: string
  icon: string
  logo?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: 'ri-home-4-line' },
  { href: '/hooks', label: 'Git Hooks', icon: 'ri-link-m' },
  { href: '/runtime-hooks', label: 'Runtime Hooks', icon: 'ri-pulse-line' },
  { href: '/patterns', label: 'Code Anti-Patterns', icon: '', logo: true },
  { href: '/config', label: 'Config Files', icon: 'ri-settings-3-line' },
  { href: '/tooling', label: 'Tools & Scripts', icon: 'ri-tools-line' },
  { href: '/guard', label: 'Workspace Guard', icon: 'ri-shield-keyhole-line' },
  { href: '/llm-gateway', label: 'LLM Gateway', icon: 'ri-router-line' },
  { href: '/checks', label: 'Static Analysis', icon: 'ri-check-double-line' },
  { href: '/playground', label: 'Playground', icon: 'ri-code-box-line' },
  { href: '/standards', label: 'Standards & Regulations', icon: 'ri-book-marked-line' },
  { href: '/integration', label: 'Integration Guide', icon: 'ri-plug-line' },
]

function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export function WikiSidebar() {
  const pathname = usePathname()
  return (
    <nav id="wiki-sidebar" className="wiki-sidebar" role="navigation" aria-label="Wiki navigation">
      <div className="wiki-sidebar__header">
        <img src="/LOGO.png" className="wiki-sidebar__logo" alt="workspaceguardrails logo" width="32" height="30" />
        <span className="wiki-sidebar__title">
          <span className="wiki-sidebar__title-thin">workspace</span>guardrails
        </span>
      </div>
      <ul className="wiki-sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const isActive = isPathActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx('wiki-sidebar__link', isActive && 'is-active')}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.logo ? (
                  <span className="wiki-sidebar__nav-logo" aria-hidden="true" />
                ) : (
                  <i className={item.icon} aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
