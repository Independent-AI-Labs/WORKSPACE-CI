import { WikiShell } from '@/components/wiki/WikiShell'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { loadApiDocs, loadShellDocs } from '@/lib/docs-loader'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

interface FoundCheck {
  name: string
  description: string | null
  source: 'python' | 'shell'
  line: number
  signature?: string
}

function findCheck(id: string): FoundCheck | null {
  const apiDocs = loadApiDocs()
  if (apiDocs) {
    for (const mod of apiDocs.modules) {
      for (const fn of mod.functions) {
        if (fn.name === id) {
          return {
            name: fn.name,
            description: fn.docstring,
            source: 'python',
            line: fn.line,
            signature: fn.signature,
          }
        }
      }
      for (const cls of mod.classes) {
        for (const method of cls.methods) {
          if (method.name === id) {
            return {
              name: method.name,
              description: method.docstring,
              source: 'python',
              line: method.line,
              signature: method.signature,
            }
          }
        }
      }
    }
  }

  const shellDocs = loadShellDocs()
  if (shellDocs) {
    for (const mod of shellDocs.modules) {
      for (const fn of mod.functions) {
        if (fn.name === id) {
          return {
            name: fn.name,
            description: fn.description,
            source: 'shell',
            line: fn.line,
          }
        }
      }
    }
  }

  return null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Check: ${id}`,
  }
}

export default async function CheckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const found = findCheck(id)

  if (!found) {
    notFound()
  }

  return (
    <WikiShell>
      <article className="check-detail">
        <h1>{found.name}</h1>
        <span className={`badge--${found.source === 'python' ? 'purple' : 'teal'}`}>
          {found.source}
        </span>
        {found.signature && (
          <pre>
            <code>{found.signature}</code>
          </pre>
        )}
        {found.description && (
          <div className="prose">
            <pre>
              <code>{found.description}</code>
            </pre>
          </div>
        )}
        <FeedbackWidget targetId={found.name} targetType="check" />
      </article>
    </WikiShell>
  )
}
