import { WikiShell } from '@/components/wiki/WikiShell'
import { WikiCard } from '@/components/wiki/WikiCard'
import { ConfigDialog } from '@/components/wiki/ConfigDialog'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { guardConfigAdapter } from '@/lib/card-adapters'
import {
  getGuardConfigIndex,
  getGuardConfigEntries,
  getGuardConfigSchema,
  getGuardConfigRawYaml,
  getGuardConfig,
} from '@/lib/yaml-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { highlightCode } from '@/lib/highlight'
import type { ConfigSchema } from '@/types/content'

export default async function GuardPage() {
  const names = await getGuardConfigIndex()
  const entries = getGuardConfigEntries(names)
  const items = guardConfigAdapter(entries)
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
            const schema = schemas[item.id] ?? null
            const html = highlightedHtml[item.id]
            const raw = rawYamls[item.id] ?? ''
            const vals = values[item.id] ?? {}
            return (
              <WikiCard key={item.id} item={item}>
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
              </WikiCard>
            )
          })}
        </div>
      )}
    </WikiShell>
  )
}
