'use client'

import clsx from 'clsx'

interface LanguageFilterProps {
  allLanguages: string[]
  activeLanguages: Set<string>
  toggleLanguage: (lang: string) => void
  selectAll: () => void
  deselectAll: () => void
  visibleCount: number
  totalCount: number
}

export function LanguageFilter({
  allLanguages,
  activeLanguages,
  toggleLanguage,
  selectAll,
  deselectAll,
  visibleCount,
  totalCount,
}: LanguageFilterProps) {
  return (
    <div className="category-nav">
      <div className="category-nav__header">
        <span className="category-nav__count">
          {visibleCount} of {totalCount} projects
        </span>
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
        {allLanguages.map((lang) => (
          <button
            key={lang}
            className={clsx(
              'category-nav__pill',
              activeLanguages.has(lang) && 'is-active',
            )}
            onClick={() => toggleLanguage(lang)}
            aria-pressed={activeLanguages.has(lang)}
          >
            {lang}
          </button>
        ))}
      </div>
    </div>
  )
}
