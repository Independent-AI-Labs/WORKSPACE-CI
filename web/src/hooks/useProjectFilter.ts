'use client'

import { useState, useMemo, useCallback } from 'react'
import type { ProjectSummary } from '@/types/projects'
import type { LanguagePercent } from '@/types/code-stats'

export interface ProjectWithLangs extends ProjectSummary {
  languagePercents: LanguagePercent[]
}

interface UseProjectFilterReturn {
  filtered: ProjectWithLangs[]
  activeLanguages: Set<string>
  toggleLanguage: (lang: string) => void
  selectAll: () => void
  deselectAll: () => void
  visibleCount: number
  totalCount: number
  allLanguages: string[]
}

export function useProjectFilter(
  projects: ProjectWithLangs[],
): UseProjectFilterReturn {
  const allLanguages = useMemo(() => {
    const set = new Set<string>()
    for (const p of projects) {
      for (const lp of p.languagePercents) {
        set.add(lp.language)
      }
    }
    return Array.from(set).sort()
  }, [projects])

  const [activeLanguages, setActiveLanguages] = useState<Set<string>>(
    () => new Set(allLanguages),
  )

  const toggleLanguage = useCallback((lang: string) => {
    setActiveLanguages((prev) => {
      const next = new Set(prev)
      if (next.has(lang)) {
        next.delete(lang)
      } else {
        next.add(lang)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setActiveLanguages(new Set(allLanguages))
  }, [allLanguages])

  const deselectAll = useCallback(() => {
    setActiveLanguages(new Set())
  }, [])

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.languagePercents.length === 0 ||
          p.languagePercents.some((lp) => activeLanguages.has(lp.language)),
      ),
    [projects, activeLanguages],
  )

  return {
    filtered,
    activeLanguages,
    toggleLanguage,
    selectAll,
    deselectAll,
    visibleCount: filtered.length,
    totalCount: projects.length,
    allLanguages,
  }
}
