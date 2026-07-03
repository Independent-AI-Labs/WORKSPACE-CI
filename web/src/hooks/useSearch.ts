'use client'

import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Fuse from 'fuse.js'
import type { FuseResult } from 'fuse.js'
import type { SearchIndexEntry } from '@/types/wiki'
import { useAnalyticsStore } from '@/stores/analytics-store'

interface UseSearchReturn {
  results: FuseResult<SearchIndexEntry>[]
  query: string
  setQuery: (q: string) => void
  isOpen: boolean
  open: () => void
  close: () => void
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  selectResult: (index: number) => void
  handleInputKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void
}

export function useSearch(searchData: SearchIndexEntry[]): UseSearchReturn {
  const track = useAnalyticsStore((s) => s.track)
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const deferredQuery = useDeferredValue(query)

  const [prevDeferredQuery, setPrevDeferredQuery] = useState(deferredQuery)
  if (deferredQuery !== prevDeferredQuery) {
    setPrevDeferredQuery(deferredQuery)
    setSelectedIndex(0)
  }

  const fuse = useMemo(
    () =>
      new Fuse(searchData, {
        keys: ['title', 'section', 'keywords', 'content'],
        threshold: 0.3,
        includeMatches: true,
        minMatchCharLength: 2,
      }),
    [searchData],
  )

  const results = useMemo(() => {
    if (!deferredQuery.trim() || !fuse) return []
    return fuse.search(deferredQuery).slice(0, 20)
  }, [deferredQuery, fuse])

  const [prevResultsLen, setPrevResultsLen] = useState(results.length)
  if (results.length !== prevResultsLen) {
    setPrevResultsLen(results.length)
    if (selectedIndex > results.length - 1) {
      setSelectedIndex(Math.max(results.length - 1, 0))
    }
  }

  const open = useCallback(() => setIsOpen(true), [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  const selectResult = useCallback(
    (index: number) => {
      const result = results[index]
      if (result) {
        const href = result.item.href
        close()
        router.push(href)
      }
    },
    [results, close, router],
  )

  const handleInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Home':
          e.preventDefault()
          setSelectedIndex(0)
          break
        case 'End':
          e.preventDefault()
          setSelectedIndex(Math.max(results.length - 1, 0))
          break
        case 'Enter':
          if (results[selectedIndex]) {
            e.preventDefault()
            selectResult(selectedIndex)
          }
          break
        case 'Escape':
          e.preventDefault()
          close()
          break
      }
    },
    [results, selectedIndex, selectResult, close],
  )

  useEffect(() => {
    if (deferredQuery.trim() && results.length > 0) {
      const handler = setTimeout(() => {
        track({
          type: 'search',
          query: deferredQuery,
          resultCount: results.length,
          timestamp: Date.now(),
          sessionId: useAnalyticsStore.getState().sessionId,
        })
      }, 500)
      return () => clearTimeout(handler)
    }
  }, [deferredQuery, results.length, track])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) {
          close()
        } else {
          open()
        }
      }
      if (e.key === '/' && !isOpen && !isInputElement(e.target)) {
        e.preventDefault()
        open()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, open, close])

  return useMemo(
    () => ({
      results,
      query,
      setQuery,
      isOpen,
      open,
      close,
      selectedIndex,
      setSelectedIndex,
      selectResult,
      handleInputKeyDown,
    }),
    [
      results,
      query,
      isOpen,
      open,
      close,
      selectedIndex,
      selectResult,
      handleInputKeyDown,
    ],
  )
}

function isInputElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  const tag = element.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || element.isContentEditable
}
