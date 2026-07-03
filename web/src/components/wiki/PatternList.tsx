'use client'

import type { ClassifiedPattern } from '@/types/patterns'
import type { FeedbackCounts } from '@/types/feedback'
import { WikiCard } from '@/components/wiki/WikiCard'
import { CategoryNav } from '@/components/wiki/CategoryNav'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { FunctionCodeDialog } from '@/components/wiki/FunctionCodeDialog'
import { usePatternFilter } from '@/hooks/usePatternFilter'
import { patternAdapter } from '@/lib/card-adapters'
import { slugify } from '@/lib/utils'

interface PatternListProps {
  patterns: ClassifiedPattern[]
  feedbackCounts?: Record<string, FeedbackCounts>
}

export function PatternList({ patterns, feedbackCounts = {} }: PatternListProps) {
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
          return (
            <WikiCard key={`${item.id}-${i}`} item={item}>
              {p.detectorFunction && p.detectorSource && (
                <FunctionCodeDialog
                  functionName={p.detectorFunction}
                  sourceFile={p.detectorSourceFile ?? ''}
                  source={p.detectorSource}
                  docstring={p.detectorDocstring}
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
