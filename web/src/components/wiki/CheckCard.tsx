import type { ApiDocsOutput, ShellDocsOutput } from '@/types/wiki'
import { ContentRenderer } from '@/components/wiki/ContentRenderer'

interface CheckCardProps {
  id: string
  name: string
  description: string | null
  source: 'python' | 'shell'
  line: number
  signature?: string
}

export function CheckCard({
  id,
  name,
  description,
  source,
  line,
  signature,
}: CheckCardProps) {
  return (
    <article className="check-card" id={id}>
      <div className="check-card__header">
        <span className={`check-card__source badge--${source === 'python' ? 'purple' : 'teal'}`}>
          {source}
        </span>
        <code className="check-card__name">{name}</code>
        <span className="check-card__line">L{line}</span>
      </div>
      {signature && (
        <code className="check-card__signature">{signature}</code>
      )}
      {description && (
        <div className="check-card__desc">
          <ContentRenderer content={description} />
        </div>
      )}
    </article>
  )
}

export function CheckList({
  apiDocs,
  shellDocs,
}: {
  apiDocs: ApiDocsOutput | null
  shellDocs: ShellDocsOutput | null
}) {
  const checks: CheckCardProps[] = []

  if (apiDocs) {
    for (const mod of apiDocs.modules) {
      for (const fn of mod.functions) {
        if (fn.is_public) {
          checks.push({
            id: fn.name,
            name: fn.name,
            description: fn.docstring,
            source: 'python',
            line: fn.line,
            signature: fn.signature,
          })
        }
      }
    }
  }

  if (shellDocs) {
    for (const mod of shellDocs.modules) {
      for (const fn of mod.functions) {
        if (fn.is_public) {
          checks.push({
            id: fn.name,
            name: fn.name,
            description: fn.description,
            source: 'shell',
            line: fn.line,
          })
        }
      }
    }
  }

  return (
    <div className="check-list">
      {checks.map((check) => (
        <CheckCard key={`${check.source}-${check.id}`} {...check} />
      ))}
    </div>
  )
}
