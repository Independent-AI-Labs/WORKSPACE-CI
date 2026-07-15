'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getNavLabelForHref } from '@/lib/wiki-nav'

function getBreadcrumbs(
  pathname: string,
  homeLandingEnabled: boolean,
): { label: string; href: string }[] {
  const parts = pathname.split('/').filter(Boolean)
  const rootHref = homeLandingEnabled ? '/' : '/projects'
  const rootLabel = getNavLabelForHref(rootHref) ?? rootHref
  const root = { label: rootLabel, href: rootHref }

  if (parts.length === 0) {
    return homeLandingEnabled ? [root] : []
  }

  let href = ''
  const crumbs: { label: string; href: string }[] = []
  for (const part of parts) {
    href += `/${part}`
    const label = getNavLabelForHref(href) ?? part
    crumbs.push({ label, href })
  }

  if (!homeLandingEnabled && parts[0] === 'projects' && parts.length === 1) {
    return [{ label: getNavLabelForHref('/projects') ?? '/projects', href: '/projects' }]
  }

  return homeLandingEnabled ? [root, ...crumbs] : crumbs
}

function buildJsonLd(crumbs: { label: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      item: crumb.href,
    })),
  }
}

interface WikiBreadcrumbsProps {
  homeLandingEnabled: boolean
}

export function WikiBreadcrumbs({ homeLandingEnabled }: WikiBreadcrumbsProps) {
  const pathname = usePathname()
  const crumbs = getBreadcrumbs(pathname, homeLandingEnabled)

  if (crumbs.length === 0) {
    return null
  }

  return (
    <nav className="wiki-breadcrumbs" aria-label="Breadcrumb">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(crumbs)) }}
      />
      <ol className="wiki-breadcrumbs__list">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li key={crumb.href} className="wiki-breadcrumbs__item">
              {isLast ? (
                <span
                  className="wiki-breadcrumbs__current"
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              ) : (
                <>
                  <Link href={crumb.href} className="wiki-breadcrumbs__link">
                    {crumb.label}
                  </Link>
                  <i className="ri-arrow-right-s-line" aria-hidden="true" />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}