'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

interface NavItem {
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: 'ri-home-4-line' },
  { href: '/patterns', label: 'Patterns', icon: 'ri-shield-line' },
  { href: '/hooks', label: 'Hooks', icon: 'ri-link-m' },
  { href: '/config', label: 'Config', icon: 'ri-settings-3-line' },
  { href: '/guard', label: 'Guard', icon: 'ri-shield-keyhole-line' },
  { href: '/checks', label: 'Checks', icon: 'ri-check-double-line' },
  { href: '/playground', label: 'Playground', icon: 'ri-code-box-line' },
  { href: '/tiers', label: 'Tiers', icon: 'ri-stack-line' },
  { href: '/tooling', label: 'Tooling', icon: 'ri-tools-line' },
  { href: '/integration', label: 'Integration', icon: 'ri-plug-line' },
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
        <i className="ri-terminal-box-line wiki-sidebar__logo" aria-hidden="true" />
        <span className="wiki-sidebar__title">digitalguardrails</span>
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
                <i className={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
