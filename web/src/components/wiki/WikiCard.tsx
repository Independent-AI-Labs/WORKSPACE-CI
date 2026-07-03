import Link from 'next/link'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { CardItem } from '@/types/card'

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
}

export function WikiCard({ item, children }: WikiCardProps) {
  const content = (
    <>
      <div className="wiki-card__header">
        {item.icon && <i className={item.icon} aria-hidden="true" />}
        {item.monoTitle ? (
          <code className="wiki-card__title">{item.title}</code>
        ) : (
          <span className="wiki-card__title">{item.title}</span>
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
        <p className="wiki-card__description">{item.description}</p>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="wiki-card__tags">
          {item.tags.map((tag, i) => (
            <span key={i} className={clsx('wiki-card__tag', TAG_BADGE[tag.variant])}>
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

      {item.href && <span className="wiki-card__cta">View details</span>}
    </>
  )

  const className = 'wiki-card'

  if (item.href) {
    return (
      <Link href={item.href} className={className} aria-label={`Open ${item.title}`}>
        {content}
      </Link>
    )
  }

  return (
    <article className={className} id={item.id}>
      {content}
    </article>
  )
}
