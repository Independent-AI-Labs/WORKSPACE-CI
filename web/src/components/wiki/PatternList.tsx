'use client'

import type { ClassifiedPattern } from '@/types/patterns'
import { PatternCard } from '@/components/wiki/PatternCard'
import { CategoryNav } from '@/components/wiki/CategoryNav'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { usePatternFilter } from '@/hooks/usePatternFilter'
import { slugify } from '@/lib/utils'

interface PatternListProps {
  patterns: ClassifiedPattern[]
}

export function PatternList({ patterns }: PatternListProps) {
  const {
    filtered,
    activeCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    visibleCount,
    totalCount,
  } = usePatternFilter(patterns)

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
      <div className="pattern-grid">
        {filtered.map((p, i) => (
          <PatternCard
            key={`${p.pattern}-${i}`}
            pattern={p}
          >
            <FeedbackWidget
              targetId={slugify(p.pattern)}
              targetType="pattern"
            />
          </PatternCard>
        ))}
      </div>
    </div>
  )
}
