'use client'

import type { ClassifiedPattern } from '@/types/patterns'
import type { FeedbackCounts } from '@/types/feedback'
import type { WikiLabelsConfig } from '@/types/wiki-labels'
import { WikiCard } from '@/components/wiki/WikiCard'
import { PillFilter } from '@/components/wiki/PillFilter'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { EntryPointDialog } from '@/components/wiki/EntryPointDialog'
import { usePatternFilter } from '@/hooks/usePatternFilter'
import { patternAdapter } from '@/lib/card-adapters'

interface PatternListProps {
  patterns: ClassifiedPattern[]
  highlightedHtml: Record<string, string>
  feedbackCounts?: Record<string, FeedbackCounts>
  labels: WikiLabelsConfig
}

export function PatternList({
  patterns,
  highlightedHtml,
  feedbackCounts = {},
  labels,
}: PatternListProps) {
  const {
    filtered,
    categories,
    activeCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    visibleCount,
    totalCount,
    categoryCounts,
  } = usePatternFilter(patterns)

  const items = patternAdapter(filtered, labels)

  return (
    <div className="pattern-list">
      <PillFilter
        categories={categories}
        activeCategories={activeCategories}
        toggleCategory={toggleCategory}
        selectAll={selectAll}
        deselectAll={deselectAll}
        categoryCounts={categoryCounts}
      />
      <p className="list-section__count">
        {visibleCount} of {totalCount} patterns
      </p>
      <div className="wiki-card-grid">
        {items.map((item, i) => {
          const p = filtered[i]
          const patternId = p.pattern
          const counts = feedbackCounts[patternId] ?? { upvotes: 0, downvotes: 0 }
          const html = p.detectorFunction
            ? highlightedHtml[p.detectorFunction]
            : undefined
          return (
            <WikiCard key={`${item.id}-${i}`} item={item}>
              {p.detectorFunction && p.detectorSource && html && (
                <EntryPointDialog
                  name={`${p.detectorFunction}()`}
                  sourceFile={p.detectorSourceFile ?? ''}
                  source={p.detectorSource}
                  highlightedHtml={html}
                  docstring={p.detectorDocstring}
                  titleId={`pattern-src-${patternId}`}
                />
              )}
              <FeedbackWidget
                targetId={patternId}
                targetType="pattern"
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
