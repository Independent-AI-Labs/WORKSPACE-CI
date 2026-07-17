'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import type { ClassifiedPattern, PatternCategory } from '@/types/patterns'
import type { PatternMatch } from '@/types/wiki'
import { getCategoryLabel } from '@/types/patterns'
import { useAnalyticsStore } from '@/stores/analytics-store'

interface EditorApi {
  scrollToLine: (line: number) => void
}

interface UsePlaygroundReturn {
  matches: PatternMatch[]
  setMatches: (matches: PatternMatch[]) => void
  language: string
  setLanguage: (lang: string) => void
  categories: { id: PatternCategory; label: string }[]
  activeCategories: Set<PatternCategory>
  toggleCategory: (category: PatternCategory) => void
  editorRef: React.MutableRefObject<EditorApi | null>
  isDirty: boolean
}

export function usePlayground(
  patterns: ClassifiedPattern[],
  initialLanguage = 'python',
): UsePlaygroundReturn {
  const [matches, setMatches] = useState<PatternMatch[]>([])
  const [language, setLanguage] = useState(initialLanguage)
  const [isDirty, setIsDirty] = useState(false)

  const categories = useMemo(() => {
    const seen = new Set<PatternCategory>()
    for (const p of patterns) seen.add(p.category)
    return Array.from(seen)
      .sort()
      .map((id) => ({ id, label: getCategoryLabel(id) }))
  }, [patterns])

  const [activeCategories, setActiveCategories] = useState<
    Set<PatternCategory>
  >(() => new Set(categories.map((c) => c.id)))

  const editorRef = useRef<EditorApi | null>(null)
  const track = useAnalyticsStore((s) => s.track)

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
    setIsDirty(true)
    track({
      type: 'playground',
      action: 'category_toggle',
      details: { category, language },
      timestamp: Date.now(),
      sessionId: useAnalyticsStore.getState().sessionId,
    })
  }, [track, language])

  const handleSetLanguage = useCallback((lang: string) => {
    setLanguage(lang)
    setMatches([])
    setIsDirty(false)
    track({
      type: 'playground',
      action: 'language_change',
      details: { from: language, to: lang },
      timestamp: Date.now(),
      sessionId: useAnalyticsStore.getState().sessionId,
    })
  }, [track, language])

  return {
    matches,
    setMatches,
    language,
    setLanguage: handleSetLanguage,
    categories,
    activeCategories,
    toggleCategory,
    editorRef,
    isDirty,
  }
}
