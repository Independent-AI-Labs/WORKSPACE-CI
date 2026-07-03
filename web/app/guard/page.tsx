import { WikiShell } from '@/components/wiki/WikiShell'
import { WikiCard } from '@/components/wiki/WikiCard'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { guardConfigAdapter } from '@/lib/card-adapters'
import { getGuardConfigIndex, getGuardConfigEntries } from '@/lib/yaml-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'

export default async function GuardPage() {
  const names = await getGuardConfigIndex()
  const entries = getGuardConfigEntries(names)
  const items = guardConfigAdapter(entries)
  const feedbackCounts = getAllFeedbackCounts('guard')

  return (
    <WikiShell>
      <h1>Guard Policy Reference</h1>
      <p className="page-intro">
        Guard policy configurations from the sibling WORKSPACE-GUARD repository.
        The guard tree is a soft dependency; configs appear here when available.
      </p>
      {items.length === 0 ? (
        <p className="empty-state">
          No guard policy configs found at WORKSPACE_GUARD_CONFIG_ROOT.
          The guard tree is a soft dependency; check that the sibling
          WORKSPACE-GUARD repo is checked out.
        </p>
      ) : (
        <div className="wiki-card-grid">
          {items.map((item) => {
            const counts = feedbackCounts[item.id] ?? { upvotes: 0, downvotes: 0 }
            return (
              <WikiCard key={item.id} item={item}>
                <FeedbackWidget
                  targetId={item.id}
                  targetType="guard"
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
