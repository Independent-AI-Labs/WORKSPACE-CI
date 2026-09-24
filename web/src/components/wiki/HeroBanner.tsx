'use client'

import { useState, type KeyboardEvent } from 'react'
import { marked } from 'marked'
import clsx from 'clsx'
import { sanitizeHtml } from '@workspace-ci/web-components/lib/sanitize'

function renderInlineMarkdown(text: string): string {
  return sanitizeHtml(marked.parseInline(text, { gfm: true }) as string)
}

interface HeroBannerProps {
  title: string
  subtitle?: string
  dynamic?: boolean
}

export function HeroBanner({ title, subtitle, dynamic = false }: HeroBannerProps) {
  const [expanded, setExpanded] = useState(false)

  const toggle = dynamic
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-expanded': expanded,
        onClick: () => setExpanded((v) => !v),
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setExpanded((v) => !v)
          }
        },
      }
    : {}

  return (
    <div className="hero-region">
      <section
        className={clsx('hero', dynamic && 'hero--dynamic', dynamic && expanded && 'hero--expanded')}
        {...toggle}
      >
        <h1
          className="hero__title"
          dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(title) }}
        />
        {subtitle && (
          <p
            className="hero__subtitle"
            dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(subtitle) }}
          />
        )}
      </section>
    </div>
  )
}
