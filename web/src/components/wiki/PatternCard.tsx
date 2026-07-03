import type { ClassifiedPattern, SwallowLanguage } from '@/types/patterns'
import { ReactNode } from 'react'
import clsx from 'clsx'
import { slugify } from '@/lib/utils'
import { FunctionCodeDialog } from '@/components/wiki/FunctionCodeDialog'

const LANGUAGE_LABELS: Record<SwallowLanguage, string> = {
  shell: 'Shell',
  python: 'Python',
  js_ts: 'JS/TS',
  ansible: 'Ansible',
  cron: 'Cron',
}

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
      {pattern.languages && pattern.languages.length > 0 && (
        <div className="pattern-card__languages">
          {pattern.languages.map((lang) => (
            <span key={lang} className="pattern-card__lang-badge">
              {LANGUAGE_LABELS[lang] ?? lang}
            </span>
          ))}
          {pattern.extensions && pattern.extensions.length > 0 && (
            <span className="pattern-card__ext-badge">
              {pattern.extensions.join(' ')}
            </span>
          )}
        </div>
      )}
      {pattern.detectionType && (
        <span className="pattern-card__detection-type">
          {pattern.detectionType}
        </span>
      )}
      {pattern.detectorFunction && pattern.detectorSource && (
        <FunctionCodeDialog
          functionName={pattern.detectorFunction}
          sourceFile={pattern.detectorSourceFile ?? ''}
          source={pattern.detectorSource}
          docstring={pattern.detectorDocstring}
        />
      )}
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
