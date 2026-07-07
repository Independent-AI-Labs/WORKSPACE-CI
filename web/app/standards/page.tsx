import { WikiShell } from '@/components/wiki/WikiShell'
import { ContactDialog } from '@/components/wiki/ContactDialog'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { CardListSection } from '@/components/wiki/CardListSection'
import { standardAdapter, deriveCategories } from '@/lib/card-adapters'
import { getStandards, getWikiLabels } from '@/lib/yaml-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { getBranding } from '@/lib/branding'
import { Icon } from '@/components/ui/Icon'
import type { ReactNode } from 'react'

export default async function StandardsPage() {
  const { standards } = await getStandards()
  const labels = getWikiLabels()
  const items = standardAdapter(standards, labels)
  const categories = deriveCategories(items)
  const feedbackCounts = getAllFeedbackCounts('standard')
  const branding = getBranding()

  const standardMap = new Map(standards.map((s) => [s.id, s]))

  const cardContent: Record<string, ReactNode> = {}
  for (const item of items) {
    const std = standardMap.get(item.id)
    if (!std) continue
    const counts = feedbackCounts[item.id] ?? {
      upvotes: 0,
      downvotes: 0,
    }
    cardContent[item.id] = (
      <>
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
            branding={branding}
          />
        )}
        <FeedbackWidget
          targetId={item.id}
          targetType="standard"
          upCount={counts.upvotes}
          downCount={counts.downvotes}
        />
      </>
    )
  }

  return (
    <WikiShell>
      <h1>Standards &amp; Regulation</h1>
      <p className="page-intro">{branding.standards_page_intro}</p>
      <CardListSection
        items={items}
        categories={categories}
        itemLabel="standards"
        cardContent={cardContent}
        emptyMessage="No standards found."
      />
    </WikiShell>
  )
}
