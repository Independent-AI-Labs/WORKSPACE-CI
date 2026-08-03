import { ReactNode } from 'react'
import { WikiSidebar } from '@/components/wiki/WikiSidebar'
import { WikiBreadcrumbs } from '@/components/wiki/WikiBreadcrumbs'
import { WikiHeaderBrand } from '@/components/wiki/WikiHeaderBrand'
import { WikiFooter } from '@/components/wiki/WikiFooter'
import { ThemeToggle } from '@workspace-ci/web-components/components/ThemeToggle'
import { WikiSearch } from '@/components/wiki/WikiSearch'
import { MobileNavToggle } from '@/components/wiki/MobileNavToggle'
import { MermaidRenderer } from '@workspace-ci/web-components/components/MermaidRenderer'
import { HeroBanner } from '@/components/wiki/HeroBanner'
import { buildSearchData, getWikiStats } from '@/lib/search-data'
import { getBranding } from '@/lib/branding'
import { isHomeLandingEnabled } from '@/lib/feature-flags'
import clsx from 'clsx'

interface WikiShellProps {
  children: ReactNode
  contentClassName?: string
  hero?: {
    title: string
    subtitle?: string
    dynamic?: boolean
  }
}

export function WikiShell({ children, contentClassName, hero }: WikiShellProps) {
  const searchData = buildSearchData()
  const stats = getWikiStats()
  const branding = getBranding()
  const homeLandingEnabled = isHomeLandingEnabled()

  return (
    <div className="wiki-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <MobileNavToggle />
      <WikiSidebar stats={stats} branding={branding} homeLandingEnabled={homeLandingEnabled} />
      <div className="wiki-main">
        <header className="wiki-header" role="banner">
          <div className="wiki-header__left">
            <WikiHeaderBrand branding={branding} homeLandingEnabled={homeLandingEnabled} />
            <WikiBreadcrumbs homeLandingEnabled={homeLandingEnabled} />
          </div>
          <div className="wiki-header__actions">
            <ThemeToggle />
            <WikiSearch searchData={searchData} />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={clsx('wiki-content', contentClassName, hero && 'wiki-content--hero')}
        >
          {hero && <HeroBanner title={hero.title} subtitle={hero.subtitle} dynamic={hero.dynamic} />}
          {children}
        </main>
        <WikiFooter branding={branding} />
      </div>
      <MermaidRenderer />
    </div>
  )
}
