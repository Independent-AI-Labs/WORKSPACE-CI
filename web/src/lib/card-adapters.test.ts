import { describe, it, expect } from 'vitest'
import {
  projectAdapter,
  configAdapter,
  guardConfigAdapter,
  patternAdapter,
  scriptAdapter,
} from '@/lib/card-adapters'
import type { ProjectSummary } from '@/types/projects'
import type { ConfigEntry, GuardConfigEntry } from '@/types/content'
import type { ClassifiedPattern } from '@/types/patterns'
import type { ScriptManifestEntry } from '@/types/wiki'

describe('projectAdapter', () => {
  const project: ProjectSummary = {
    slug: 'ci',
    displayName: 'CI',
    language: 'Python',
    icon: 'ri-terminal-line',
    title: 'CI Pipeline Monitor',
    summary: 'A collection of CI utilities.',
  }

  it('converts project to CardItem with correct fields', () => {
    const [item] = projectAdapter([project])
    expect(item.id).toBe('ci')
    expect(item.title).toBe('CI')
    expect(item.subtitle).toBe('CI Pipeline Monitor')
    expect(item.description).toBe('A collection of CI utilities.')
    expect(item.href).toBe('/ci')
    expect(item.icon).toBe('ri-terminal-line')
    expect(item.monoTitle).toBeUndefined()
    expect(item.tags).toEqual([{ label: 'Python', variant: 'muted' }])
  })
})

describe('configAdapter', () => {
  const config: ConfigEntry = {
    name: 'banned_words',
    hasSchema: true,
    link: '/config/banned_words',
    description: 'Words banned from source code.',
    fieldCount: 5,
  }

  it('converts config to CardItem with mono title', () => {
    const [item] = configAdapter([config])
    expect(item.id).toBe('banned_words')
    expect(item.title).toBe('banned_words')
    expect(item.monoTitle).toBe(true)
    expect(item.href).toBe('/config/banned_words')
    expect(item.icon).toBe('ri-settings-3-line')
    expect(item.meta).toEqual([{ label: 'Fields', value: '5' }])
  })

  it('omits meta when fieldCount is undefined', () => {
    const [item] = configAdapter([{ ...config, fieldCount: undefined }])
    expect(item.meta).toBeUndefined()
  })
})

describe('guardConfigAdapter', () => {
  const entry: GuardConfigEntry = {
    name: 'guard_paths',
    title: 'Paths',
    link: '/guard/guard_paths',
    hasSchema: true,
    description: 'Filesystem paths.',
    fieldCount: 3,
  }

  it('converts guard config to CardItem with shield icon', () => {
    const [item] = guardConfigAdapter([entry])
    expect(item.id).toBe('guard_paths')
    expect(item.title).toBe('guard_paths')
    expect(item.monoTitle).toBe(true)
    expect(item.icon).toBe('ri-shield-keyhole-line')
    expect(item.meta).toEqual([{ label: 'Fields', value: '3' }])
  })
})

describe('patternAdapter', () => {
  const pattern: ClassifiedPattern = {
    pattern: '\\.parent\\.parent',
    reason: 'Fragile path navigation.',
    category: 'obsolete-paths',
    categoryLabel: 'Obsolete Paths',
    scope: 'content',
    languages: ['python'],
    extensions: ['.py'],
    detectionType: 'inline',
  }

  it('converts pattern to CardItem with slug id and no href', () => {
    const [item] = patternAdapter([pattern])
    expect(item.id).toBe('parent-parent')
    expect(item.title).toBe('\\.parent\\.parent')
    expect(item.monoTitle).toBe(true)
    expect(item.href).toBeUndefined()
    expect(item.category).toBe('Obsolete Paths')
  })

  it('creates accent tags for languages and muted tags for extensions', () => {
    const [item] = patternAdapter([pattern])
    expect(item.tags).toEqual([
      { label: 'Python', variant: 'accent' },
      { label: '.py', variant: 'muted' },
      { label: 'inline', variant: 'muted' },
    ])
  })

  it('includes scope meta when scope is not content', () => {
    const [item] = patternAdapter([
      { ...pattern, scope: 'filename' as const },
    ])
    expect(item.meta).toEqual([
      { label: 'Scope', value: 'Filename match' },
    ])
  })

  it('includes detector meta when detectorFunction is set', () => {
    const [item] = patternAdapter([
      { ...pattern, detectorFunction: '_check_except_pass' },
    ])
    expect(item.meta).toEqual([
      { label: 'Detector', value: '_check_except_pass' },
    ])
  })
})

describe('scriptAdapter', () => {
  const script: ScriptManifestEntry = {
    id: 'extract-swallow',
    path: 'scripts/extract-swallow-source.py',
    summary: 'Extracts detector source code.',
    usage: 'python scripts/extract-swallow-source.py',
    category: 'extraction',
    output: 'JSON file',
    make_target: 'extract-swallow',
  }

  it('converts script to CardItem with no href', () => {
    const [item] = scriptAdapter([script])
    expect(item.id).toBe('extract-swallow')
    expect(item.title).toBe('extract-swallow')
    expect(item.monoTitle).toBe(true)
    expect(item.href).toBeUndefined()
    expect(item.description).toBe('Extracts detector source code.')
    expect(item.tags).toEqual([
      { label: 'extraction', variant: 'accent' },
    ])
    expect(item.meta).toEqual([
      { label: 'Make target', value: 'extract-swallow' },
    ])
  })

  it('omits meta when make_target is undefined', () => {
    const [item] = scriptAdapter([{ ...script, make_target: undefined }])
    expect(item.meta).toBeUndefined()
  })
})
