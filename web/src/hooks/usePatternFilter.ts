'use client'

import { useState, useMemo, useCallback } from 'react'
import type { ClassifiedPattern } from '@/types/patterns'
import type { PatternCategory } from '@/types/patterns'
import { getCategoryLabel } from '@/types/patterns'

interface UsePatternFilterReturn {
  filtered: ClassifiedPattern[]
  categories: { id: string; label: string }[]
  activeCategories: Set<string>
  toggleCategory: (category: string) => void
  selectAll: () => void
  deselectAll: () => void
  visibleCount: number
  totalCount: number
  categoryCounts: Record<string, number>
}

export function usePatternFilter(
  patterns: ClassifiedPattern[],
): UsePatternFilterReturn {
  const categories = useMemo(() => {
    const seen = new Set<PatternCategory>()
    for (const p of patterns) seen.add(p.category)
    return Array.from(seen)
      .sort()
      .map((id) => ({ id, label: getCategoryLabel(id) }))
  }, [patterns])

  const allIds = useMemo(() => categories.map((c) => c.id), [categories])

  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    () => new Set(allIds),
  )

  const toggleCategory = useCallback((category: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
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
    for (const p of patterns) {
      counts[p.category] = (counts[p.category] ?? 0) + 1
    }
    return counts
  }, [patterns])

  const filtered = useMemo(
    () => patterns.filter((p) => activeCategories.has(p.category)),
    [patterns, activeCategories],
  )

  return {
    filtered,
    categories,
    activeCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    visibleCount: filtered.length,
    totalCount: patterns.length,
    categoryCounts,
  }
}
