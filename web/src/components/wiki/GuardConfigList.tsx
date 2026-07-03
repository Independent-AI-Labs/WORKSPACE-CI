import Link from 'next/link'
import type { GuardConfigEntry } from '@/types/content'

interface GuardConfigListProps {
  entries: GuardConfigEntry[]
}

export function GuardConfigList({ entries }: GuardConfigListProps) {
  return (
    <section
      className="guard-config-list"
      aria-label="Guard policy configs"
    >
      {entries.length === 0 ? (
        <p className="guard-empty-state">
          No guard policy configs found at WORKSPACE_GUARD_CONFIG_ROOT.
          The guard tree is a soft dependency; check that the sibling
          WORKSPACE-GUARD repo is checked out.
        </p>
      ) : (
        <ul className="guard-config-list__items">
          {entries.map((entry) => (
            <li key={entry.name} className="guard-config-list__item">
              <Link href={entry.link} className="guard-config-list__link">
                <i className="ri-shield-keyhole-line" aria-hidden="true" />
                <span className="guard-config-list__title">{entry.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
