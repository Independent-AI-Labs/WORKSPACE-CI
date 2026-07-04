import { WikiShell } from '@/components/wiki/WikiShell'
import { WikiCard } from '@/components/wiki/WikiCard'
import { ContactDialog } from '@/components/wiki/ContactDialog'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { standardAdapter } from '@/lib/card-adapters'
import { loadStandards } from '@/lib/docs-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { Icon } from '@/components/ui/Icon'

export default async function StandardsPage() {
  const standards = loadStandards() ?? []
  const items = standardAdapter(standards)
  const feedbackCounts = getAllFeedbackCounts('standard')

  const standardMap = new Map(standards.map((s) => [s.id, s]))

  return (
    <WikiShell>
      <h1>Standards &amp; Regulations</h1>
      <p className="page-intro">
        Curated catalogue of AI standards, regulations, frameworks, and
        declarations from around the world. Open documents are available for
        direct download. Paid standards are listed with contact information
        for standardisation and audit-related inquiries.
      </p>
      {items.length === 0 ? (
        <p className="empty-state">No standards found.</p>
      ) : (
        <div className="wiki-card-grid">
          {items.map((item) => {
            const std = standardMap.get(item.id)
            if (!std) return null
            const counts = feedbackCounts[item.id] ?? {
              upvotes: 0,
              downvotes: 0,
            }
            return (
              <WikiCard key={item.id} item={item}>
                {std.free && std.downloadPath ? (
                  <a
                    href={std.downloadPath}
                    download
                    className="standards-download-btn btn btn--primary"
                  >
                    <Icon name="ri-download-2-line" size="sm" />
                    Download PDF
                  </a>
                ) : std.free && std.sourceUrl ? (
                  <a
                    href={std.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="standards-download-btn btn btn--primary"
                  >
                    <Icon name="ri-external-link-line" size="sm" />
                    Access Free Copy
                  </a>
                ) : (
                  <ContactDialog
                    title={std.title}
                    fullTitle={std.fullTitle}
                    issuer={std.issuer}
                    price={std.price}
                    purchaseUrl={std.purchaseUrl}
                  />
                )}
                <FeedbackWidget
                  targetId={item.id}
                  targetType="standard"
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
