'use client'

import { PATTERN_CATEGORIES } from '@/types/patterns'
import type { PatternCategory } from '@/types/patterns'
import clsx from 'clsx'

interface PatternCategoryFilterProps {
  active: Set<PatternCategory>
  onToggle: (category: PatternCategory) => void
}

export function PatternCategoryFilter({
  active,
  onToggle,
}: PatternCategoryFilterProps) {
  return (
    <div className="pattern-category-filter">
      {PATTERN_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          className={clsx(
            'filter-pill',
            active.has(cat.id) && 'is-active',
          )}
          onClick={() => onToggle(cat.id)}
          aria-pressed={active.has(cat.id)}
        >
          {cat.label}
        </button>
      ))}
    </div>
  )
}
