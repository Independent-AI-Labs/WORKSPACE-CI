import { WikiShell } from '@/components/wiki/WikiShell'
import { EntryPointDialog } from '@/components/wiki/EntryPointDialog'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { CardListSection } from '@/components/wiki/CardListSection'
import { scriptAdapter, deriveCategories } from '@/lib/card-adapters'
import { getScriptManifest } from '@/lib/yaml-loader'
import { loadScriptSources } from '@/lib/docs-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { highlightCode } from '@/lib/highlight'
import type { ReactNode } from 'react'

export default async function ToolingPage() {
  const manifest = await getScriptManifest()
  const items = scriptAdapter(manifest.scripts)
  const categories = deriveCategories(items)
  const feedbackCounts = getAllFeedbackCounts('tooling')
  const sourceData = loadScriptSources()

  const sourceMap = new Map(
    (sourceData?.sources ?? []).map((s) => [s.id, s]),
  )

  const highlightedHtml: Record<string, string> = {}
  for (const s of sourceData?.sources ?? []) {
    highlightedHtml[s.id] = await highlightCode(s.source, s.language)
  }

  const scriptMap = new Map(manifest.scripts.map((s) => [s.id, s]))

  const cardContent: Record<string, ReactNode> = {}
  for (const item of items) {
    const script = scriptMap.get(item.id)
    const counts = feedbackCounts[item.id] ?? { upvotes: 0, downvotes: 0 }
    const src = sourceMap.get(item.id)
    const html = highlightedHtml[item.id]
    cardContent[item.id] = (
      <>
        {src && html && script && (
          <EntryPointDialog
            name={script.id}
            sourceFile={src.source_file}
            source={src.source}
            highlightedHtml={html}
            docstring={src.docstring ?? undefined}
            titleId={`script-src-${script.id}`}
            details={
              <>
                <pre>{script.usage}</pre>
                {script.args && script.args.length > 0 && (
                  <dl>
                    {script.args.map((arg) => (
                      <div key={arg.name}>
                        <dt>{arg.name}</dt>
                        <dd>{arg.description}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p>
                  <strong>Output:</strong> {script.output}
                </p>
              </>
            }
          />
        )}
        <FeedbackWidget
          targetId={item.id}
          targetType="tooling"
          upCount={counts.upvotes}
          downCount={counts.downvotes}
        />
      </>
    )
  }

  return (
    <WikiShell>
      <h1>Tooling</h1>
      <p className="page-intro">
        Scripts available in the workspace-ci repository for bootstrapping,
        auditing, and managing CI infrastructure across the workspace.
      </p>
      <CardListSection
        items={items}
        categories={categories}
        itemLabel="scripts"
        cardContent={cardContent}
        emptyMessage="No scripts found."
      />
    </WikiShell>
  )
}
