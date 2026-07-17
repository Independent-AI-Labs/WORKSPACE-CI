'use client'

import type { PatternCategory } from '@/types/patterns'
import clsx from 'clsx'

interface PatternCategoryFilterProps {
  categories: { id: PatternCategory; label: string }[]
  active: Set<PatternCategory>
  onToggle: (category: PatternCategory) => void
}

export function PatternCategoryFilter({
  categories,
  active,
  onToggle,
}: PatternCategoryFilterProps) {
  return (
    <div className="pattern-category-filter">
      {categories.map((cat) => (
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
