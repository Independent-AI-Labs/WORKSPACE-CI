'use client'

import type { ClassifiedPattern } from '@/types/patterns'
import type { FeedbackCounts } from '@/types/feedback'
import { WikiCard } from '@/components/wiki/WikiCard'
import { CategoryNav } from '@/components/wiki/CategoryNav'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { EntryPointDialog } from '@/components/wiki/EntryPointDialog'
import { usePatternFilter } from '@/hooks/usePatternFilter'
import { patternAdapter } from '@/lib/card-adapters'
import { slugify } from '@/lib/utils'

interface PatternListProps {
  patterns: ClassifiedPattern[]
  highlightedHtml: Record<string, string>
  feedbackCounts?: Record<string, FeedbackCounts>
}

export function PatternList({
  patterns,
  highlightedHtml,
  feedbackCounts = {},
}: PatternListProps) {
  const {
    filtered,
    activeCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    visibleCount,
    totalCount,
  } = usePatternFilter(patterns)

  const items = patternAdapter(filtered)

  return (
    <div className="pattern-list">
      <CategoryNav
        patterns={patterns}
        activeCategories={activeCategories}
        toggleCategory={toggleCategory}
        selectAll={selectAll}
        deselectAll={deselectAll}
        visibleCount={visibleCount}
        totalCount={totalCount}
      />
      <div className="pattern-list__count">
        {visibleCount} of {totalCount} patterns
      </div>
      <div className="wiki-card-grid">
        {items.map((item, i) => {
          const p = filtered[i]
          const patternId = slugify(p.pattern)
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
