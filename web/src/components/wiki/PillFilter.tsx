'use client'

import clsx from 'clsx'

interface PillFilterProps {
  categories: { id: string; label: string }[]
  activeCategories: Set<string>
  toggleCategory: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  categoryCounts: Record<string, number>
}

export function PillFilter({
  categories,
  activeCategories,
  toggleCategory,
  selectAll,
  deselectAll,
  categoryCounts,
}: PillFilterProps) {
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
        {categories.map((cat) => (
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
            <span className="category-nav__pill-count">
              {categoryCounts[cat.id] ?? 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
