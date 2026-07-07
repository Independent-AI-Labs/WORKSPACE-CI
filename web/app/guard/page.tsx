import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigDialog } from '@/components/wiki/ConfigDialog'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { CardListSection } from '@/components/wiki/CardListSection'
import { guardConfigAdapter, deriveCategories } from '@/lib/card-adapters'
import {
  getGuardConfigIndex,
  getGuardConfigEntries,
  getGuardConfigSchema,
  getGuardConfigRawYaml,
  getGuardConfig,
  getWikiLabels,
} from '@/lib/yaml-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { highlightCode } from '@/lib/highlight'
import type { ConfigSchema } from '@/types/content'
import type { ReactNode } from 'react'

export default async function GuardPage() {
  const names = await getGuardConfigIndex()
  const entries = getGuardConfigEntries(names)
  const labels = getWikiLabels()
  const items = guardConfigAdapter(entries, labels)
  const categories = deriveCategories(items)
  const feedbackCounts = getAllFeedbackCounts('guard')

  const schemas: Record<string, ConfigSchema | null> = {}
  const rawYamls: Record<string, string> = {}
  const highlightedHtml: Record<string, string> = {}
  const values: Record<string, Record<string, unknown>> = {}

  for (const e of entries) {
    schemas[e.name] = await getGuardConfigSchema(e.name)
    rawYamls[e.name] = getGuardConfigRawYaml(e.name)
    highlightedHtml[e.name] = await highlightCode(rawYamls[e.name], 'yaml')
    try {
      values[e.name] = await getGuardConfig(e.name)
    } catch {
      values[e.name] = {}
    }
  }

  const cardContent: Record<string, ReactNode> = {}
  for (const item of items) {
    const counts = feedbackCounts[item.id] ?? { upvotes: 0, downvotes: 0 }
    const schema = schemas[item.id] ?? null
    const html = highlightedHtml[item.id]
    const raw = rawYamls[item.id] ?? ''
    const vals = values[item.id] ?? {}
    cardContent[item.id] = (
      <>
        {html && (
          <ConfigDialog
            name={`${item.id}.yaml`}
            sourceFile={`WORKSPACE-GUARD/config/${item.id}.yaml`}
            rawContent={raw}
            highlightedHtml={html}
            schema={schema}
            values={vals}
            titleId={`guard-src-${item.id}`}
          />
        )}
        <FeedbackWidget
          targetId={item.id}
          targetType="guard"
          upCount={counts.upvotes}
          downCount={counts.downvotes}
        />
      </>
    )
  }

  return (
    <WikiShell>
      <h1>Guard Policy Reference</h1>
      <p className="page-intro">
        Guard policy configurations from the sibling WORKSPACE-GUARD repository.
        The guard tree is a soft dependency; configs appear here when available.
      </p>
      <CardListSection
        items={items}
        categories={categories}
        itemLabel="guard policies"
        cardContent={cardContent}
        emptyMessage="No guard policy configs found at WORKSPACE_GUARD_CONFIG_ROOT. The guard tree is a soft dependency; check that the sibling WORKSPACE-GUARD repo is checked out."
      />
    </WikiShell>
  )
}
