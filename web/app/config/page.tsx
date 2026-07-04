import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigDialog } from '@/components/wiki/ConfigDialog'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { CardListSection } from '@/components/wiki/CardListSection'
import { configAdapter, deriveCategories } from '@/lib/card-adapters'
import { getConfigIndex, getConfigSchema, getConfigRawYaml, getConfigValue } from '@/lib/yaml-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { highlightCode } from '@/lib/highlight'
import type { ConfigSchema } from '@/types/content'
import type { ReactNode } from 'react'

export default async function ConfigPage() {
  const configs = await getConfigIndex()
  const items = configAdapter(configs)
  const categories = deriveCategories(items)
  const feedbackCounts = getAllFeedbackCounts('config')

  const schemas: Record<string, ConfigSchema | null> = {}
  const rawYamls: Record<string, string> = {}
  const highlightedHtml: Record<string, string> = {}
  const values: Record<string, Record<string, unknown>> = {}

  for (const c of configs) {
    schemas[c.name] = await getConfigSchema(c.name)
    rawYamls[c.name] = getConfigRawYaml(c.name)
    highlightedHtml[c.name] = await highlightCode(rawYamls[c.name], 'yaml')
    try {
      values[c.name] = await getConfigValue(c.name)
    } catch {
      values[c.name] = {}
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
            sourceFile={`config/${item.id}.yaml`}
            rawContent={raw}
            highlightedHtml={html}
            schema={schema}
            values={vals}
            titleId={`config-src-${item.id}`}
          />
        )}
        <FeedbackWidget
          targetId={item.id}
          targetType="config"
          upCount={counts.upvotes}
          downCount={counts.downvotes}
        />
      </>
    )
  }

  return (
    <WikiShell>
      <h1>Configuration Reference</h1>
      <p className="page-intro">
        YAML configuration files and their field-level documentation.
        Each config may have an associated schema that documents required
        and optional fields.
      </p>
      <CardListSection
        items={items}
        categories={categories}
        itemLabel="configs"
        cardContent={cardContent}
        emptyMessage="No configuration files found. Check that the config directory is accessible at WORKSPACE_CI_CONFIG_ROOT."
      />
    </WikiShell>
  )
}
