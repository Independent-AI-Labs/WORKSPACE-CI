'use client'

import type { ClassifiedPattern } from '@/types/patterns'
import type { PatternCategory } from '@/types/patterns'
import { PATTERN_CATEGORIES } from '@/types/patterns'
import clsx from 'clsx'

interface CategoryNavProps {
  patterns: ClassifiedPattern[]
  activeCategories: Set<PatternCategory>
  toggleCategory: (category: PatternCategory) => void
  selectAll: () => void
  deselectAll: () => void
}

export function CategoryNav({
  patterns,
  activeCategories,
  toggleCategory,
  selectAll,
  deselectAll,
}: CategoryNavProps) {
  const categoryCounts = PATTERN_CATEGORIES.map((cat) => ({
    ...cat,
    count: patterns.filter((p) => p.category === cat.id).length,
  })).filter((c) => c.count > 0)

  return (
    <div className="category-nav">
      <div className="category-nav__header">
        <span />
        <div className="category-nav__actions">
          <button className="btn btn--sm btn--ghost" onClick={selectAll}>
            Select all
          </button>
          <button className="btn btn--sm btn--ghost" onClick={deselectAll}>
            Deselect all
          </button>
        </div>
      </div>
      <div className="category-nav__pills">
        {categoryCounts.map((cat) => (
          <button
            key={cat.id}
            className={clsx(
              'category-nav__pill',
              activeCategories.has(cat.id) && 'is-active',
            )}
            onClick={() => toggleCategory(cat.id)}
            aria-pressed={activeCategories.has(cat.id)}
          >
            {cat.label}
            <span className="category-nav__pill-count">{cat.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
