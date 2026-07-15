'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import type { WikiStats } from '@/lib/search-data'
import type { Branding } from '@/lib/branding'
import { useSidebarStore } from '@/stores/sidebar-store'
import { HOME_NAV_ITEM, WIKI_NAV_ITEMS, type WikiNavItem } from '@/lib/wiki-nav'
import { ThemeLogo } from './ThemeLogo'

function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  if (href === '/projects') return pathname === '/projects'
  return pathname === href || pathname.startsWith(href + '/')
}

interface WikiSidebarProps {
  stats: WikiStats
  branding: Branding
  homeLandingEnabled: boolean
}

function NavLink({
  item,
  pathname,
  stats,
  onNavigate,
}: {
  item: WikiNavItem
  pathname: string
  stats: WikiStats
  onNavigate: () => void
}) {
  const isActive = isPathActive(pathname, item.href)
  const count = item.count ? stats[item.count] : undefined

  return (
    <Link
      href={item.href}
      className={clsx('wiki-sidebar__link', isActive && 'is-active')}
      aria-current={isActive ? 'page' : undefined}
      title={item.label}
      onClick={onNavigate}
    >
      <i className={item.icon} aria-hidden="true" />
      <span>{item.label}</span>
      {count !== undefined && <span className="wiki-sidebar__count">[{count}]</span>}
    </Link>
  )
}

export function WikiSidebar({ stats, branding, homeLandingEnabled }: WikiSidebarProps) {
  const pathname = usePathname()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)
  const toggle = useSidebarStore((s) => s.toggle)
  const navScrollRef = useRef<HTMLDivElement>(null)
  const brandHref = homeLandingEnabled ? '/' : '/projects'
  const brandTitle = homeLandingEnabled ? 'Home' : 'Projects'

  useEffect(() => {
    if (!mobileOpen) return
    navScrollRef.current?.scrollTo(0, 0)
  }, [mobileOpen])

  const closeMobile = () => setMobileOpen(false)

  return (
    <nav id="wiki-sidebar" className={clsx('wiki-sidebar', mobileOpen && 'is-open')} role="navigation" aria-label="Wiki navigation">
      <div className="wiki-sidebar__header">
        <Link
          href={brandHref}
          className="wiki-sidebar__brand"
          title={brandTitle}
          onClick={closeMobile}
        >
          <ThemeLogo
            src={branding.logo_path}
            srcDark={branding.logo_path_dark}
            srcLight={branding.logo_path_light}
            className="wiki-sidebar__logo"
            alt={`${branding.sidebar_title_thin}${branding.sidebar_title_bold} logo`}
            colorVar="var(--text)"
          />
          <span className="wiki-sidebar__title">
            <span className="wiki-sidebar__title-thin">{branding.sidebar_title_thin}</span>
            {branding.sidebar_title_bold}
          </span>
        </Link>
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

      {homeLandingEnabled && (
        <ul className="wiki-sidebar__nav wiki-sidebar__nav--pinned">
          <li>
            <NavLink item={HOME_NAV_ITEM} pathname={pathname} stats={stats} onNavigate={closeMobile} />
          </li>
        </ul>
      )}

      <div className="wiki-sidebar__nav-scroll" ref={navScrollRef}>
        <ul className="wiki-sidebar__nav">
          {WIKI_NAV_ITEMS.map((item) => (
            <li key={item.href} className={clsx(item.divider && 'wiki-sidebar__divider')}>
              <NavLink item={item} pathname={pathname} stats={stats} onNavigate={closeMobile} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}