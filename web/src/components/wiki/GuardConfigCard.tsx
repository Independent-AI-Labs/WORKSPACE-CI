import Link from 'next/link'
import type { GuardConfigEntry } from '@/types/content'
import clsx from 'clsx'

interface GuardConfigCardProps {
  entry: GuardConfigEntry
}

export function GuardConfigCard({ entry }: GuardConfigCardProps) {
  return (
    <Link href={entry.link} className="guard-card">
      <div className="config-card__header">
        <i className="ri-shield-keyhole-line" aria-hidden="true" />
        <code className="config-card__name">{entry.name}</code>
        <span
          className={clsx(
            'config-card__schema',
            entry.hasSchema ? 'badge--green' : 'badge--orange',
          )}
        >
          {entry.hasSchema ? 'has schema' : 'no schema'}
        </span>
      </div>
      {entry.description && (
        <p className="config-card__description">{entry.description}</p>
      )}
      {entry.fieldCount !== undefined && (
        <span className="config-card__field-count">
          {entry.fieldCount} {entry.fieldCount === 1 ? 'field' : 'fields'}
        </span>
      )}
    </Link>
  )
}
