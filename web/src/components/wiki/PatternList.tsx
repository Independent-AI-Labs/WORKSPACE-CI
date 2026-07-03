import type { ClassifiedPattern } from '@/types/patterns'
import { PatternCard } from '@/components/wiki/PatternCard'
import { CategoryNav } from '@/components/wiki/CategoryNav'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { slugify } from '@/lib/utils'

interface PatternListProps {
  patterns: ClassifiedPattern[]
}

export function PatternList({ patterns }: PatternListProps) {
  return (
    <div className="pattern-list">
      <CategoryNav patterns={patterns} />
      <div className="pattern-list__count">
        {patterns.length} patterns
      </div>
      <div className="pattern-grid">
        {patterns.map((p, i) => (
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
