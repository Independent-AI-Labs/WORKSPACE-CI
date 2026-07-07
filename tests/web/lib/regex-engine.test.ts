import { describe, it, expect, beforeEach } from 'vitest'
import { runPatterns, clearRegexCache } from '@/lib/regex-engine'
import type { ClassifiedPattern } from '@/types/patterns'

const patterns: ClassifiedPattern[] = [
  {
    pattern: 'eslint-disable',
    reason: 'ESLint suppression forbidden.',
    category: 'linter-suppression',
    categoryLabel: 'Linter Suppression',
    scope: 'content',
  },
  {
    pattern: '\\bgetattr\\(',
    reason: 'getattr is unsafe.',
    category: 'unsafe-reflection',
    categoryLabel: 'Unsafe Reflection',
    scope: 'content',
  },
  {
    pattern: '_v[0-9]+',
    reason: 'No versioned filenames.',
    category: 'filename-rules',
    categoryLabel: 'Filename Rules',
    scope: 'filename',
  },
]

describe('runPatterns', () => {
  beforeEach(() => {
    clearRegexCache()
  })

  it('matches patterns in source code', () => {
    const code = 'const x = eslint-disable rules\nconst y = getattr(obj, "key")'
    const activeCats = new Set(['linter-suppression', 'unsafe-reflection'])
    const matches = runPatterns(code, patterns, activeCats)
    expect(matches.length).toBe(2)
  })

  it('returns empty array for empty input', () => {
    const matches = runPatterns('', patterns, new Set(['linter-suppression']))
    expect(matches).toEqual([])
  })

  it('skips patterns not in active categories', () => {
    const code = 'eslint-disable here'
    const matches = runPatterns(code, patterns, new Set(['unsafe-reflection']))
    expect(matches).toEqual([])
  })

  it('deduplicates matches on same line', () => {
    const code = 'eslint-disable eslint-disable'
    const matches = runPatterns(code, patterns, new Set(['linter-suppression']))
    expect(matches.length).toBe(1)
  })

  it('calculates correct line numbers', () => {
    const code = 'line1\nline2\neslint-disable here'
    const matches = runPatterns(code, patterns, new Set(['linter-suppression']))
    expect(matches[0].line).toBe(3)
  })

  it('skips invalid regex patterns', () => {
    const invalidPatterns: ClassifiedPattern[] = [
      {
        pattern: '[invalid',
        reason: 'test',
        category: 'special-chars',
        categoryLabel: 'Special Characters',
        scope: 'content',
      },
    ]
    const matches = runPatterns('test', invalidPatterns, new Set(['special-chars']))
    expect(matches).toEqual([])
  })

  it('sorts matches by line number', () => {
    const code = 'getattr(x, "a")\neslint-disable'
    const matches = runPatterns(code, patterns, new Set(['linter-suppression', 'unsafe-reflection']))
    expect(matches[0].line).toBe(1)
    expect(matches[1].line).toBe(2)
  })
})
