'use client'

import { useSearch } from '@/hooks/useSearch'
import { Modal } from '@/components/ui/Modal'
import type { SearchIndexEntry } from '@/types/wiki'
import clsx from 'clsx'

const LISTBOX_ID = 'wiki-search-listbox'

interface WikiSearchProps {
  searchData: SearchIndexEntry[]
}

export function WikiSearch({ searchData }: WikiSearchProps) {
  const search = useSearch(searchData)
  const optionId = (i: number) => `wiki-search-option-${i}`

  const activeOptionId =
    search.results.length > 0 && search.selectedIndex < search.results.length
      ? optionId(search.selectedIndex)
      : undefined

  return (
    <>
      <button
        type="button"
        className="search-trigger"
        onClick={search.open}
        aria-label="Search wiki"
        aria-haspopup="dialog"
      >
        <i className="ri-search-line" aria-hidden="true" />
        <span className="search-trigger__text">Search</span>
        <kbd className="search-trigger__kbd">/</kbd>
      </button>
      <Modal
        open={search.isOpen}
        onClose={search.close}
        ariaLabel="Search wiki"
        className="search-modal"
        toolbar={
          <div className="search-modal__input">
            <i className="ri-search-line" aria-hidden="true" />
            <input
              type="text"
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              onKeyDown={search.handleInputKeyDown}
              aria-label="Search query"
              role="combobox"
              aria-expanded={search.isOpen}
              aria-controls={LISTBOX_ID}
              aria-activedescendant={activeOptionId}
              autoComplete="off"
              autoFocus
              className="search-modal__field"
            />
            <button
              type="button"
              className="search-modal__close"
              onClick={search.close}
              aria-label="Close search"
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
        }
      >
        <ul className="search-modal__results" id={LISTBOX_ID} role="listbox">
          {search.results.length === 0 && search.query.trim() && (
            <li className="search-modal__empty">No results found</li>
          )}
          {search.results.map((result, i) => (
            <li
              key={result.item.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === search.selectedIndex}
              onMouseEnter={() => search.setSelectedIndex(i)}
            >
              <a
                href={result.item.href}
                className={clsx(
                  'search-modal__result',
                  i === search.selectedIndex && 'is-selected',
                )}
                onClick={(e) => {
                  e.preventDefault()
                  search.selectResult(i)
                }}
              >
                <span className="search-modal__result-type">
                  {result.item.type}
                </span>
                <span className="search-modal__result-title">
                  {result.item.title}
                </span>
                <span className="search-modal__result-section">
                  {result.item.section}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
