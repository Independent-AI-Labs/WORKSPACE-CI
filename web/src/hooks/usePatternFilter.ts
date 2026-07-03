'use client'

import { useState, useMemo, useCallback } from 'react'
import type { ClassifiedPattern } from '@/types/patterns'
import type { PatternCategory } from '@/types/patterns'
import { PATTERN_CATEGORIES } from '@/types/patterns'

interface UsePatternFilterReturn {
  filtered: ClassifiedPattern[]
  activeCategories: Set<PatternCategory>
  toggleCategory: (category: PatternCategory) => void
  selectAll: () => void
  deselectAll: () => void
  visibleCount: number
  totalCount: number
}

export function usePatternFilter(
  patterns: ClassifiedPattern[],
): UsePatternFilterReturn {
  const [activeCategories, setActiveCategories] = useState<
    Set<PatternCategory>
  >(new Set(PATTERN_CATEGORIES.map((c) => c.id)))

  const toggleCategory = useCallback((category: PatternCategory) => {
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
    setActiveCategories(new Set(PATTERN_CATEGORIES.map((c) => c.id)))
  }, [])

  const deselectAll = useCallback(() => {
    setActiveCategories(new Set())
  }, [])

  const filtered = useMemo(
    () => patterns.filter((p) => activeCategories.has(p.category)),
    [patterns, activeCategories],
  )

  return {
    filtered,
    activeCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    visibleCount: filtered.length,
    totalCount: patterns.length,
  }
}
