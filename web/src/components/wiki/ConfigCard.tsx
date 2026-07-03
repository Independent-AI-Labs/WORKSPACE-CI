import Link from 'next/link'
import type { ConfigEntry } from '@/types/content'
import clsx from 'clsx'

interface ConfigCardProps {
  config: ConfigEntry
}

export function ConfigCard({ config }: ConfigCardProps) {
  return (
    <Link
      href={config.link}
      className="config-card"
    >
      <div className="config-card__header">
        <i className="ri-settings-3-line" aria-hidden="true" />
        <code className="config-card__name">{config.name}</code>
        <span
          className={clsx(
            'config-card__schema',
            config.hasSchema ? 'badge--green' : 'badge--orange',
          )}
        >
          {config.hasSchema ? 'has schema' : 'no schema'}
        </span>
      </div>
      {config.description && (
        <p className="config-card__description">{config.description}</p>
      )}
      {config.fieldCount !== undefined && (
        <span className="config-card__field-count">
          {config.fieldCount} {config.fieldCount === 1 ? 'field' : 'fields'}
        </span>
      )}
    </Link>
  )
}
