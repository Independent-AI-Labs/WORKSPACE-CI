import type { ClassifiedPattern } from '@/types/patterns'
import { ReactNode } from 'react'
import clsx from 'clsx'
import { slugify } from '@/lib/utils'

interface PatternCardProps {
  pattern: ClassifiedPattern
  children?: ReactNode
}

export function PatternCard({ pattern, children }: PatternCardProps) {
  return (
    <article
      className="pattern-card"
      id={`pattern-${slugify(pattern.pattern)}`}
    >
      <span
        className={clsx('pattern-card__badge', `badge--${pattern.category}`)}
      >
        {pattern.categoryLabel}
      </span>
      <code className="pattern-card__regex">{pattern.pattern}</code>
      <p className="pattern-card__reason">{pattern.reason}</p>
      {pattern.scope !== 'content' && (
        <span className="pattern-card__scope">
          {pattern.scope === 'filename'
            ? 'Filename match'
            : `Directory: ${pattern.directory}`}
        </span>
      )}
      {children && <div className="pattern-card__feedback">{children}</div>}
    </article>
  )
}
