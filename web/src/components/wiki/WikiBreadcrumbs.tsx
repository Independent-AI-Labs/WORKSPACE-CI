'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { pageTitle } from '@/lib/utils'

function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: { label: string; href: string }[] = []

  if (parts.length === 0) {
    return [{ label: 'Open Source', href: '/' }]
  }

  let href = ''
  for (const part of parts) {
    href += `/${part}`
    const title = pageTitle(href)
    const label = title !== href ? title : part
    crumbs.push({ label, href })
  }

  return [{ label: 'Open Source', href: '/' }, ...crumbs]
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

export function WikiBreadcrumbs() {
  const pathname = usePathname()
  const crumbs = getBreadcrumbs(pathname)

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
