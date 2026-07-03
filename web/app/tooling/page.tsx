import { WikiShell } from '@/components/wiki/WikiShell'
import { WikiCard } from '@/components/wiki/WikiCard'
import { CardDetails } from '@/components/ui/CardDetails'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { scriptAdapter } from '@/lib/card-adapters'
import { getScriptManifest } from '@/lib/yaml-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'

export default async function ToolingPage() {
  const manifest = await getScriptManifest()
  const items = scriptAdapter(manifest.scripts)
  const feedbackCounts = getAllFeedbackCounts('tooling')

  return (
    <WikiShell>
      <h1>Tooling</h1>
      <p className="page-intro">
        Scripts available in the workspace-ci repository, including usage
        examples, arguments, and expected output.
      </p>
      {items.length === 0 ? (
        <p className="empty-state">
          No scripts found. Check that the script manifest is accessible.
        </p>
      ) : (
        <div className="wiki-card-grid">
          {items.map((item, i) => {
            const script = manifest.scripts[i]
            const counts = feedbackCounts[item.id] ?? { upvotes: 0, downvotes: 0 }
            return (
              <WikiCard key={item.id} item={item}>
                <CardDetails label="Usage details">
                  <pre className="tooling-card__usage">
                    <code>{script.usage}</code>
                  </pre>
                  {script.args && script.args.length > 0 && (
                    <dl className="tooling-card__args">
                      {script.args.map((arg) => (
                        <div key={arg.name}>
                          <dt><code>{arg.name}</code></dt>
                          <dd>{arg.description}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="tooling-card__output">
                    <strong>Output:</strong> {script.output}
                  </p>
                </CardDetails>
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
