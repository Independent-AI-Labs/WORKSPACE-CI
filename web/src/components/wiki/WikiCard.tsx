import Link from 'next/link'
import clsx from 'clsx'
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import type { ReactNode } from 'react'
import type { CardItem } from '@/types/card'
import { ThemeLogo } from './ThemeLogo'

function renderInlineMd(text: string): string {
  return sanitizeHtml(marked.parseInline(text, { gfm: true }) as string)
}

const STATUS_BADGE: Record<NonNullable<CardItem['status']>, string> = {
  ok: 'badge--green',
  warn: 'badge--orange',
  info: 'badge--blue',
}

const TAG_BADGE: Record<NonNullable<CardItem['tags']>[number]['variant'], string> = {
  accent: 'badge--blue',
  muted: 'badge--gray',
  warn: 'badge--orange',
  ok: 'badge--green',
}

interface WikiCardProps {
  item: CardItem
  children?: ReactNode
  viewDetails?: ReactNode
}

export function WikiCard({ item, children, viewDetails }: WikiCardProps) {
  const titleEl = item.monoTitle ? (
    <code className="wiki-card__title">{item.title}</code>
  ) : (
    <span className="wiki-card__title">{item.title}</span>
  )

  const content = (
    <>
      <div className="wiki-card__header">
        {item.logoPath ? (
          <ThemeLogo src={item.logoPath} className="wiki-card__logo" />
        ) : (
          item.icon && <i className={item.icon} aria-hidden="true" />
        )}
        {item.href ? (
          <Link href={item.href} className="wiki-card__title-link">
            {titleEl}
          </Link>
        ) : (
          titleEl
        )}
        {item.status && item.statusLabel && (
          <span className={clsx('wiki-card__status', STATUS_BADGE[item.status])}>
            {item.statusLabel}
          </span>
        )}
      </div>

      {item.subtitle && (
        <p className="wiki-card__subtitle">{item.subtitle}</p>
      )}

      {item.description && (
        <div className="wiki-card__description">
          {item.description.split('\n\n').map((paragraph, i) => (
            <p
              key={i}
              dangerouslySetInnerHTML={{ __html: renderInlineMd(paragraph) }}
            />
          ))}
        </div>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="wiki-card__tags">
          {item.tags.map((tag, i) => (
            <span key={i} className={clsx('wiki-card__tag', TAG_BADGE[tag.variant], tag.className)}>
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {item.meta && item.meta.length > 0 && (
        <dl className="wiki-card__meta">
          {item.meta.map((m, i) => (
            <div key={i} className="wiki-card__meta-item">
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {children && <div className="wiki-card__children">{children}</div>}

      {(viewDetails || item.repoUrl) && (
        <div className="wiki-card__footer">
          {viewDetails}
          {item.repoUrl && (
            <a
              href={item.repoUrl}
              className="wiki-card__external-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="ri-external-link-line" aria-hidden="true" />
              GitHub
            </a>
          )}
        </div>
      )}
    </>
  )

  return (
    <article className="wiki-card" id={item.id}>
      {content}
    </article>
  )
}
