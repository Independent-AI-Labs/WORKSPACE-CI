'use client'

import type { HookRecord } from '@/types/hooks'
import type { FeedbackCounts } from '@/types/feedback'
import type { EntryPointSource } from '@/types/entry-point'
import type { WikiLabelsConfig } from '@/types/wiki-labels'
import { WikiCard } from '@/components/wiki/WikiCard'
import { StageFilter } from '@/components/wiki/StageFilter'
import { TierFilter } from '@/components/wiki/TierFilter'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { EntryPointDialog } from '@/components/wiki/EntryPointDialog'
import { useHookFilter } from '@/hooks/useHookFilter'
import { hookAdapter } from '@/lib/card-adapters'

interface HookListProps {
  hooks: HookRecord[]
  descriptions: Record<string, string>
  sourceMap: Map<string, EntryPointSource>
  highlightedHtml: Record<string, string>
  feedbackCounts?: Record<string, FeedbackCounts>
  labels: WikiLabelsConfig
}

export function HookList({
  hooks,
  descriptions,
  sourceMap,
  highlightedHtml,
  feedbackCounts = {},
  labels,
}: HookListProps) {
  const {
    filtered,
    activeStages,
    activeTiers,
    toggleStage,
    toggleTier,
    stageCounts,
    tierCounts,
  } = useHookFilter(hooks)

  const items = hookAdapter(filtered, descriptions, labels)

  return (
    <div className="hook-list">
      <div className="hook-list__filters">
        <StageFilter
          activeStages={activeStages}
          toggleStage={toggleStage}
          stageCounts={stageCounts}
        />
        <TierFilter
          activeTiers={activeTiers}
          toggleTier={toggleTier}
          tierCounts={tierCounts}
        />
      </div>
      <p className="list-section__count">
        {filtered.length} of {hooks.length} hooks
      </p>
      <div className="wiki-card-grid">
        {items.map((item, i) => {
          const hook = filtered[i]
          const counts = feedbackCounts[hook.id] ?? { upvotes: 0, downvotes: 0 }
          const src = sourceMap.get(hook.id)
          const html = highlightedHtml[hook.id]
          const isShell = hook.kind.startsWith('shell')
          const label = isShell ? `${hook.entry}()` : hook.entry
          return (
            <WikiCard key={item.id} item={item}>
              {src && html && (
                <EntryPointDialog
                  name={label}
                  sourceFile={src.source_file}
                  source={src.source}
                  highlightedHtml={html}
                  docstring={src.docstring ?? undefined}
                  titleId={`hook-src-${hook.id}`}
                  details={
                    <dl>
                      <div>
                        <dt>Stage</dt>
                        <dd>{hook.stage}</dd>
                      </div>
                      <div>
                        <dt>Kind</dt>
                        <dd>{hook.kind}</dd>
                      </div>
                      <div>
                        <dt>Mandatory</dt>
                        <dd>{hook.mandatory ? 'Yes' : 'No (exemptable)'}</dd>
                      </div>
                      <div>
                        <dt>Safety tier</dt>
                        <dd>{hook.safety ? 'Yes (POC)' : 'No (strict only)'}</dd>
                      </div>
                      <div>
                        <dt>Pass filenames</dt>
                        <dd>{hook.pass_filenames ? 'Yes' : 'No'}</dd>
                      </div>
                      <div>
                        <dt>Always run</dt>
                        <dd>{hook.always_run ? 'Yes' : 'No'}</dd>
                      </div>
                      <div>
                        <dt>Applicable to</dt>
                        <dd>{hook.applicable_to.join(', ')}</dd>
                      </div>
                      {hook.files && (
                        <div>
                          <dt>Files scope</dt>
                          <dd>{hook.files}</dd>
                        </div>
                      )}
                      {hook.files_types && (
                        <div>
                          <dt>File types</dt>
                          <dd>{hook.files_types.join(', ')}</dd>
                        </div>
                      )}
                    </dl>
                  }
                />
              )}
              <FeedbackWidget
                targetId={hook.id}
                targetType="hook"
                upCount={counts.upvotes}
                downCount={counts.downvotes}
              />
            </WikiCard>
          )
        })}
      </div>
    </div>
  )
}
