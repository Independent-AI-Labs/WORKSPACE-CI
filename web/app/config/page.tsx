import { WikiShell } from '@/components/wiki/WikiShell'
import { WikiCard } from '@/components/wiki/WikiCard'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { configAdapter } from '@/lib/card-adapters'
import { getConfigIndex } from '@/lib/yaml-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'

export default async function ConfigPage() {
  const configs = await getConfigIndex()
  const items = configAdapter(configs)
  const feedbackCounts = getAllFeedbackCounts('config')

  return (
    <WikiShell>
      <h1>Configuration Reference</h1>
      <p className="page-intro">
        YAML configuration files and their field-level documentation.
        Each config may have an associated schema that documents required
        and optional fields.
      </p>
      {items.length === 0 ? (
        <p className="empty-state">
          No configuration files found. Check that the config directory is
          accessible at WORKSPACE_CI_CONFIG_ROOT.
        </p>
      ) : (
        <div className="wiki-card-grid">
          {items.map((item) => {
            const counts = feedbackCounts[item.id] ?? { upvotes: 0, downvotes: 0 }
            return (
              <WikiCard key={item.id} item={item}>
                <FeedbackWidget
                  targetId={item.id}
                  targetType="config"
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
