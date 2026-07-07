import { describe, it, expect } from 'vitest'
import { classifyPattern, classifyAll, classifySwallowPatterns } from '@/lib/patterns'
import type { BannedWordsConfig, SwallowPatternConfig, SwallowDetectorData } from '@/types/patterns'

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

describe('classifySwallowPatterns', () => {
  const swallowConfig: SwallowPatternConfig = {
    version: 1,
    file_types: {
      shell: { extensions: ['.sh', '.bash'] },
      python: { extensions: ['.py'] },
      js_ts: { extensions: ['.js', '.ts'] },
      ansible: { extensions: ['.yml'] },
      cron: { filenames: ['crontab'] },
    },
    inline_patterns: [
      {
        id: 'sh-pipe-true',
        regex: '\\|\\|\\s*true\\b',
        language: 'shell',
        description: 'Pipe-to-true masks command failure.',
      },
      {
        id: 'js-empty-catch',
        regex: '\\}\\s*catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}',
        language: 'js_ts',
        description: 'Empty catch block swallows the error.',
      },
    ],
    custom_detectors: [
      {
        id: 'cron-no-log-redirect',
        detector: '_check_cron_inline',
        source_file: 'lib/check_silent_swallow.py',
        language: 'cron',
        description: 'Cron job without a log redirect.',
      },
    ],
    multiline_detectors: [
      {
        id: 'py-except-pass',
        detector: 'detect_python_multiline',
        source_file: 'lib/check_silent_swallow_python.py',
        language: 'python',
        description: 'Except block with bare pass.',
      },
      {
        id: 'py-except-continue',
        detector: 'detect_python_multiline',
        source_file: 'lib/check_silent_swallow_python.py',
        language: 'python',
        description: 'Except block with bare continue.',
      },
    ],
  }

  const detectorData: SwallowDetectorData = {
    generated_at: '2026-01-01T00:00:00Z',
    source_version: 'abc123',
    detectors: [
      {
        name: '_check_cron_inline',
        source_file: 'lib/check_silent_swallow.py',
        docstring: 'Check a cron line for missing log redirect.',
        source: 'def _check_cron_inline(): pass',
      },
      {
        name: 'detect_python_multiline',
        source_file: 'lib/check_silent_swallow_python.py',
        docstring: 'Detect except-header followed by sole-statement body.',
        source: 'def detect_python_multiline(): pass',
      },
    ],
  }

  it('classifies inline patterns as error-swallowing', () => {
    const results = classifySwallowPatterns(swallowConfig, detectorData)
    const inline = results.find((p) => p.pattern === '\\|\\|\\s*true\\b')
    expect(inline).toBeDefined()
    expect(inline!.category).toBe('error-swallowing')
    expect(inline!.categoryLabel).toBe('Error Swallowing')
    expect(inline!.detectionType).toBe('inline')
    expect(inline!.languages).toEqual(['shell'])
    expect(inline!.extensions).toEqual(['.sh', '.bash'])
    expect(inline!.detectorFunction).toBeUndefined()
  })

  it('classifies custom detector patterns with detector info', () => {
    const results = classifySwallowPatterns(swallowConfig, detectorData)
    const custom = results.find((p) => p.pattern === 'cron-no-log-redirect')
    expect(custom).toBeDefined()
    expect(custom!.detectionType).toBe('custom')
    expect(custom!.detectorFunction).toBe('_check_cron_inline')
    expect(custom!.detectorSource).toBe('def _check_cron_inline(): pass')
    expect(custom!.detectorDocstring).toBe(
      'Check a cron line for missing log redirect.',
    )
    expect(custom!.detectorSourceFile).toBe('lib/check_silent_swallow.py')
    expect(custom!.languages).toEqual(['cron'])
  })

  it('classifies multiline detector patterns with detector info', () => {
    const results = classifySwallowPatterns(swallowConfig, detectorData)
    const multiline = results.filter(
      (p) => p.detectionType === 'multiline',
    )
    expect(multiline).toHaveLength(2)
    expect(multiline[0].detectorFunction).toBe('detect_python_multiline')
    expect(multiline[0].detectorSource).toBe(
      'def detect_python_multiline(): pass',
    )
  })

  it('merges all pattern types', () => {
    const results = classifySwallowPatterns(swallowConfig, detectorData)
    expect(results).toHaveLength(5)
    expect(results.every((p) => p.category === 'error-swallowing')).toBe(true)
  })

  it('handles missing detector data gracefully', () => {
    const results = classifySwallowPatterns(swallowConfig, null)
    const custom = results.find((p) => p.pattern === 'cron-no-log-redirect')
    expect(custom).toBeDefined()
    expect(custom!.detectorSource).toBeUndefined()
    expect(custom!.detectorDocstring).toBeUndefined()
  })

  it('handles empty config', () => {
    const results = classifySwallowPatterns(
      { version: 1, file_types: {}, inline_patterns: [] },
      null,
    )
    expect(results).toHaveLength(0)
  })
})
