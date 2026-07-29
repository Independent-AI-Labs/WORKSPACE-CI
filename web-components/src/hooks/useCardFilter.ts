'use client'

import { useState, useMemo, useCallback } from 'react'
import type { CardItem } from '../types/card'

interface CategoryOption {
  id: string
  label: string
}

interface UseCardFilterReturn {
  filtered: CardItem[]
  activeCategories: Set<string>
  toggleCategory: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  visibleCount: number
  totalCount: number
  categoryCounts: Record<string, number>
}

export function useCardFilter(
  items: CardItem[],
  categories: CategoryOption[],
): UseCardFilterReturn {
  const allIds = useMemo(
    () => categories.map((c) => c.id),
    [categories],
  )

  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    () => new Set(allIds),
  )

  const toggleCategory = useCallback((id: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setActiveCategories(new Set(allIds))
  }, [allIds])

  const deselectAll = useCallback(() => {
    setActiveCategories(new Set())
  }, [])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const category of categories) {
      counts[category.id] = 0
    }
    for (const item of items) {
      if (item.category === undefined) {
        throw new Error(`card item "${item.id}" is missing a category`)
      }
      const prev = counts[item.category]
      counts[item.category] = prev === undefined ? 1 : prev + 1
    }
    return counts
  }, [items, categories])

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (item.category === undefined) {
          throw new Error(`card item "${item.id}" is missing a category`)
        }
        return activeCategories.has(item.category)
      }),
    [items, activeCategories],
  )

  return {
    filtered,
    activeCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    visibleCount: filtered.length,
    totalCount: items.length,
    categoryCounts,
  }
}
