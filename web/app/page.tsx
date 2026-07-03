import { WikiShell } from '@/components/wiki/WikiShell'
import { WikiCard } from '@/components/wiki/WikiCard'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { projectAdapter } from '@/lib/card-adapters'
import { loadAllProjectSummaries } from '@/lib/project-registry'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'

export default async function HomePage() {
  const projects = await loadAllProjectSummaries()
  const items = projectAdapter(projects)
  const feedbackCounts = getAllFeedbackCounts('project')

  return (
    <WikiShell>
      <h1>Project Catalogue</h1>
      <p className="page-intro">
        Browse README documentation for all backend projects in the workspace.
        Click a project to read its full README.
      </p>
      <div className="wiki-card-grid">
        {items.map((item) => {
          const counts = feedbackCounts[item.id] ?? { upvotes: 0, downvotes: 0 }
          return (
            <WikiCard key={item.id} item={item}>
              <FeedbackWidget
                targetId={item.id}
                targetType="project"
                upCount={counts.upvotes}
                downCount={counts.downvotes}
              />
            </WikiCard>
          )
        })}
      </div>
    </WikiShell>
  )
}
