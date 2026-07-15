'use client'

import type { ReactNode } from 'react'
import type { CardItem } from '@/types/card'
import { WikiCard } from '@/components/wiki/WikiCard'
import { PillFilter } from '@/components/wiki/PillFilter'
import { useCardFilter } from '@/hooks/useCardFilter'

interface CardListSectionProps {
  items: CardItem[]
  categories: { id: string; label: string }[]
  itemLabel: string
  cardContent: Record<string, ReactNode>
  emptyMessage?: string
}

export function CardListSection({
  items,
  categories,
  itemLabel,
  cardContent,
  emptyMessage = 'No items found.',
}: CardListSectionProps) {
  const {
    filtered,
    activeCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    visibleCount,
    totalCount,
    categoryCounts,
  } = useCardFilter(items, categories)

  if (totalCount === 0) {
    return <p className="empty-state">{emptyMessage}</p>
  }

  return (
    <div className="card-list-section">
      <PillFilter
        categories={categories}
        activeCategories={activeCategories}
        toggleCategory={toggleCategory}
        selectAll={selectAll}
        deselectAll={deselectAll}
        categoryCounts={categoryCounts}
      />
      <p className="list-section__count">
        {visibleCount} of {totalCount} {itemLabel}
      </p>
      <div className="wiki-card-grid">
        {filtered.map((item) => (
          <WikiCard key={item.id} item={item}>
            {cardContent[item.id]}
          </WikiCard>
        ))}
      </div>
    </div>
  )
}
