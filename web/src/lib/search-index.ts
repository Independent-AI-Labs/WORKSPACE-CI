import Fuse from 'fuse.js'
import type { SearchIndexEntry } from '@/types/wiki'
import type { FuseResult } from 'fuse.js'

const fuseOptions = {
  keys: ['title', 'section', 'keywords', 'content'],
  threshold: 0.3,
  includeMatches: true,
  minMatchCharLength: 2,
}

export function createSearchIndex(
  data: SearchIndexEntry[],
): Fuse<SearchIndexEntry> {
  return new Fuse(data, fuseOptions)
}

export function searchIndex(
  index: Fuse<SearchIndexEntry>,
  query: string,
  limit = 20,
): FuseResult<SearchIndexEntry>[] {
  if (!query.trim()) return []
  return index.search(query).slice(0, limit)
}

export function buildSearchIndexFromPatterns(
  patterns: { pattern: string; reason: string; category: string; categoryLabel: string; scope: string }[],
): SearchIndexEntry[] {
  return patterns.map((p, i) => ({
    id: `pattern-${i}`,
    title: p.pattern,
    section: 'Patterns',
    content: `${p.reason} Category: ${p.categoryLabel}`,
    href: `/patterns#${i}`,
    type: 'pattern' as const,
    keywords: [p.category, p.categoryLabel, p.scope],
  }))
}

export function buildSearchIndexFromHooks(
  hooks: { id: string; entry: string; stage: string; kind: string }[],
  descriptions?: Record<string, string>,
): SearchIndexEntry[] {
  return hooks.map((h) => ({
    id: `hook-${h.id}`,
    title: h.id,
    section: 'Hooks',
    content: descriptions?.[h.id]
      ? `${descriptions[h.id]} Stage: ${h.stage}, Kind: ${h.kind}, Entry: ${h.entry}`
      : `Stage: ${h.stage}, Kind: ${h.kind}, Entry: ${h.entry}`,
    href: `/hooks#${h.id}`,
    type: 'hook' as const,
    keywords: [h.stage, h.kind, h.entry],
  }))
}
