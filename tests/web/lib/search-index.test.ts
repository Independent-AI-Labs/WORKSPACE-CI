import { describe, it, expect } from 'vitest'
import { createSearchIndex, searchIndex, buildSearchIndexFromPatterns, buildSearchIndexFromHooks } from '@/lib/search-index'
import type { SearchIndexEntry } from '@/types/wiki'

const testData: SearchIndexEntry[] = [
  {
    id: '1',
    title: 'eslint-disable',
    section: 'Patterns',
    content: 'ESLint suppression forbidden',
    href: '/anti-patterns#1',
    type: 'pattern',
    keywords: ['linter', 'eslint'],
  },
  {
    id: '2',
    title: 'getattr',
    section: 'Patterns',
    content: 'getattr is unsafe reflection',
    href: '/anti-patterns#2',
    type: 'pattern',
    keywords: ['reflection', 'unsafe'],
  },
  {
    id: '3',
    title: 'check-unstaged',
    section: 'Hooks',
    content: 'Pre-commit hook for unstaged files',
    href: '/hooks#check-unstaged',
    type: 'hook',
    keywords: ['pre-commit', 'safety'],
  },
]

describe('search-index', () => {
  it('builds index from data', () => {
    const index = createSearchIndex(testData)
    expect(index).toBeDefined()
  })

  it('returns results for matching query', () => {
    const index = createSearchIndex(testData)
    const results = searchIndex(index, 'eslint')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.title).toBe('eslint-disable')
  })

  it('returns empty for empty query', () => {
    const index = createSearchIndex(testData)
    const results = searchIndex(index, '')
    expect(results).toEqual([])
  })

  it('supports fuzzy matching', () => {
    const index = createSearchIndex(testData)
    const results = searchIndex(index, 'getatr')
    expect(results.length).toBeGreaterThan(0)
  })

  it('respects limit', () => {
    const index = createSearchIndex(testData)
    const results = searchIndex(index, 'e', 1)
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it('builds index from patterns', () => {
    const patterns = [
      { pattern: 'test', reason: 'test reason', category: 'test', categoryLabel: 'Test', scope: 'content' },
    ]
    const entries = buildSearchIndexFromPatterns(patterns)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('pattern')
  })

  it('builds index from hooks', () => {
    const hooks = [
      { id: 'test-hook', entry: 'ci_test', stage: 'pre-commit', kind: 'shell' },
    ]
    const entries = buildSearchIndexFromHooks(hooks)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('hook')
  })
})
