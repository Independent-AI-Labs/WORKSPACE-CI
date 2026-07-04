import { WikiShell } from '@/components/wiki/WikiShell'
import { WikiCard } from '@/components/wiki/WikiCard'
import { EntryPointDialog } from '@/components/wiki/EntryPointDialog'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { scriptAdapter } from '@/lib/card-adapters'
import { getScriptManifest } from '@/lib/yaml-loader'
import { loadScriptSources } from '@/lib/docs-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { highlightCode } from '@/lib/highlight'

export default async function ToolingPage() {
  const manifest = await getScriptManifest()
  const items = scriptAdapter(manifest.scripts)
  const feedbackCounts = getAllFeedbackCounts('tooling')
  const sourceData = loadScriptSources()

  const sourceMap = new Map(
    (sourceData?.sources ?? []).map((s) => [s.id, s]),
  )

  const highlightedHtml: Record<string, string> = {}
  for (const s of sourceData?.sources ?? []) {
    highlightedHtml[s.id] = await highlightCode(s.source, s.language)
  }

  return (
    <WikiShell>
      <h1>Tooling</h1>
      <p className="page-intro">
        Scripts available in the workspace-ci repository for bootstrapping,
        auditing, and managing CI infrastructure across the workspace.
      </p>
      {items.length === 0 ? (
        <p className="empty-state">No scripts found.</p>
      ) : (
        <div className="wiki-card-grid">
          {items.map((item, i) => {
            const script = manifest.scripts[i]
            const counts = feedbackCounts[item.id] ?? { upvotes: 0, downvotes: 0 }
            const src = sourceMap.get(item.id)
            const html = highlightedHtml[item.id]
            return (
              <WikiCard key={item.id} item={item}>
                {src && html && (
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
              </WikiCard>
            )
          })}
        </div>
      )}
    </WikiShell>
  )
}
