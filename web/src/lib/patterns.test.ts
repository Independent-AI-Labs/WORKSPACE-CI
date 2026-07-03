import { describe, it, expect } from 'vitest'
import { classifyPattern, classifyAll } from '@/lib/patterns'
import type { BannedWordsConfig } from '@/types/patterns'

describe('classifyPattern', () => {
  it('classifies a linter suppression pattern', () => {
    const result = classifyPattern(
      { pattern: 'eslint-disable', reason: 'ESLint suppression forbidden. Fix the code.' },
      'content',
    )
    expect(result.category).toBe('linter-suppression')
    expect(result.scope).toBe('content')
    expect(result.categoryLabel).toBe('Linter Suppression')
  })

  it('classifies a deferred types pattern', () => {
    const result = classifyPattern(
      { pattern: '\\blist\\[object\\]', reason: 'list[object] provides zero type safety.' },
      'content',
    )
    expect(result.category).toBe('deferred-types')
  })

  it('classifies a quiet errors pattern', () => {
    const result = classifyPattern(
      { pattern: '\\bsilent', reason: 'No silent anything. Log errors or fail explicitly.' },
      'content',
    )
    expect(result.category).toBe('quiet-errors')
  })

  it('classifies an obsolete paths pattern', () => {
    const result = classifyPattern(
      { pattern: '\\blegacy\\b', reason: 'No legacy code paths.' },
      'content',
    )
    expect(result.category).toBe('obsolete-paths')
  })

  it('classifies a suppression pattern', () => {
    const result = classifyPattern(
      { pattern: '\\.suppress', reason: 'No suppression of errors/warnings.' },
      'content',
    )
    expect(result.category).toBe('suppression')
  })

  it('classifies an unsafe reflection pattern', () => {
    const result = classifyPattern(
      { pattern: '\\bgetattr\\(', reason: 'getattr is unsafe. Use explicit attribute access.' },
      'content',
    )
    expect(result.category).toBe('unsafe-reflection')
  })

  it('classifies a data classes pattern', () => {
    const result = classifyPattern(
      { pattern: '@dataclass', reason: 'Use Pydantic models instead of dataclasses.' },
      'content',
    )
    expect(result.category).toBe('data-classes')
  })

  it('classifies a test quality pattern', () => {
    const result = classifyPattern(
      { pattern: '\\bxfail\\b', reason: 'No xfail tests. Fix the code.' },
      'content',
    )
    expect(result.category).toBe('test-quality')
  })

  it('classifies a path safety pattern', () => {
    const result = classifyPattern(
      { pattern: '/home/', reason: 'No hardcoded home paths. Use environment variables.' },
      'content',
    )
    expect(result.category).toBe('path-safety')
  })

  it('classifies a UUID pattern', () => {
    const result = classifyPattern(
      { pattern: 'uuid\\.uuid[134568]\\(', reason: 'Only uuid7 allowed.' },
      'content',
    )
    expect(result.category).toBe('uuid')
  })

  it('classifies a container versions pattern', () => {
    const result = classifyPattern(
      { pattern: ':latest\\b', reason: 'Pin container versions. No :latest tags.' },
      'content',
    )
    expect(result.category).toBe('container-versions')
  })

  it('classifies a deprecated python pattern', () => {
    const result = classifyPattern(
      { pattern: '\\bpython3?\\b', reason: 'Use uv run python for hermetic execution.' },
      'content',
    )
    expect(result.category).toBe('deprecated-python')
  })

  it('classifies a special chars pattern', () => {
    const result = classifyPattern(
      { pattern: ' -- ', reason: 'ASCII em-dash punctuation forbidden.' },
      'content',
    )
    expect(result.category).toBe('special-chars')
  })

  it('classifies filename rules with filename scope', () => {
    const result = classifyPattern(
      { pattern: '_v[0-9]+', reason: 'No versioned filenames. Use git.' },
      'filename',
    )
    expect(result.category).toBe('filename-rules')
    expect(result.scope).toBe('filename')
  })

  it('classifies directory rules with directory scope', () => {
    const result = classifyPattern(
      { pattern: 'reason=.*not implemented yet', reason: 'Implement the test or delete it.' },
      'directory',
      'tests',
    )
    expect(result.category).toBe('directory-rules')
    expect(result.scope).toBe('directory')
    expect(result.directory).toBe('tests')
  })
})

describe('classifyAll', () => {
  const config: BannedWordsConfig = {
    version: '4.0.0',
    banned: [
      { pattern: 'eslint-disable', reason: 'ESLint suppression forbidden.' },
      { pattern: '\\blegacy\\b', reason: 'No legacy code paths.' },
    ],
    directory_rules: {
      tests: [
        { pattern: 'reason=.*not implemented', reason: 'Implement the test.' },
      ],
    },
    filename_rules: [
      { pattern: '_v[0-9]+', reason: 'No versioned filenames.' },
    ],
  }

  it('classifies all three groups', () => {
    const results = classifyAll(config)
    expect(results).toHaveLength(4)
  })

  it('assigns correct scopes', () => {
    const results = classifyAll(config)
    const contentPatterns = results.filter((p) => p.scope === 'content')
    const directoryPatterns = results.filter((p) => p.scope === 'directory')
    const filenamePatterns = results.filter((p) => p.scope === 'filename')
    expect(contentPatterns).toHaveLength(2)
    expect(directoryPatterns).toHaveLength(1)
    expect(filenamePatterns).toHaveLength(1)
  })

  it('assigns directory field for directory scope', () => {
    const results = classifyAll(config)
    const dirPattern = results.find((p) => p.scope === 'directory')
    expect(dirPattern?.directory).toBe('tests')
  })

  it('handles empty config', () => {
    const results = classifyAll({
      version: '4.0.0',
      banned: [],
    })
    expect(results).toHaveLength(0)
  })
})
