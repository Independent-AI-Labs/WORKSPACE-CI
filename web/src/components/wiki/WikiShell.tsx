import { ReactNode } from 'react'
import { WikiSidebar } from '@/components/wiki/WikiSidebar'
import { WikiBreadcrumbs } from '@/components/wiki/WikiBreadcrumbs'
import { WikiFooter } from '@/components/wiki/WikiFooter'
import { ThemeToggle } from '@/components/wiki/ThemeToggle'
import { WikiSearch } from '@/components/wiki/WikiSearch'
import { MobileNavToggle } from '@/components/wiki/MobileNavToggle'
import { MermaidRenderer } from '@/components/wiki/MermaidRenderer'
import { buildSearchData, getWikiStats } from '@/lib/search-data'
import { getBranding } from '@/lib/branding'

interface WikiShellProps {
  children: ReactNode
}

export function WikiShell({ children }: WikiShellProps) {
  const searchData = buildSearchData()
  const stats = getWikiStats()
  const branding = getBranding()

  return (
    <div className="wiki-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <MobileNavToggle />
      <WikiSidebar stats={stats} branding={branding} />
      <div className="wiki-main">
        <header className="wiki-header" role="banner">
          <div className="wiki-header__left">
            <WikiBreadcrumbs />
          </div>
          <div className="wiki-header__actions">
            <ThemeToggle />
            <WikiSearch searchData={searchData} />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="wiki-content">
          {children}
        </main>
        <WikiFooter branding={branding} />
      </div>
      <MermaidRenderer />
    </div>
  )
}
