import { describe, it, expect } from 'vitest'
import {
  projectAdapter,
  configAdapter,
  guardConfigAdapter,
  patternAdapter,
  scriptAdapter,
  hookAdapter,
  standardAdapter,
  deriveCategories,
} from '@/lib/card-adapters'
import type { ProjectSummary } from '@/types/projects'
import type { ConfigEntry, GuardConfigEntry } from '@/types/content'
import type { ClassifiedPattern } from '@/types/patterns'
import type { ScriptManifestEntry } from '@/types/wiki'
import type { HookRecord } from '@/types/hooks'
import type { LanguagePercent } from '@/types/code-stats'
import type { StandardEntry } from '@/types/standards'

describe('projectAdapter', () => {
  const project: ProjectSummary = {
    slug: 'ci',
    displayName: 'CI',
    language: 'Python',
    repoName: 'CI',
    icon: 'ri-terminal-line',
    logoPath: '/LOGO.png',
    title: 'CI Pipeline Monitor',
    summary: 'A collection of CI utilities.',
  }

  it('converts project to CardItem with correct fields', () => {
    const [item] = projectAdapter([project])
    expect(item.id).toBe('CI')
    expect(item.title).toBe('CI')
    expect(item.subtitle).toBe('CI Pipeline Monitor')
    expect(item.description).toBe('A collection of CI utilities.')
    expect(item.href).toBe('/ci')
    expect(item.repoUrl).toBeUndefined()
    expect(item.icon).toBe('ri-terminal-line')
    expect(item.logoPath).toBe('/LOGO.png')
    expect(item.monoTitle).toBeUndefined()
    expect(item.tags).toEqual([{ label: 'Python', variant: 'muted' }])
  })

  it('passes repoUrl through when set on ProjectSummary', () => {
    const [item] = projectAdapter([{ ...project, repoUrl: 'https://github.com/Test-Org/CI' }])
    expect(item.repoUrl).toBe('https://github.com/Test-Org/CI')
  })

  it('shows language percent badges when code-stats provided', () => {
    const langPercents: Record<string, LanguagePercent[]> = {
      CI: [
        { language: 'Python', code: 800, percent: 80 },
        { language: 'Bourne Shell', code: 200, percent: 20 },
      ],
    }
    const [item] = projectAdapter([project], langPercents)
    expect(item.tags).toEqual([
      { label: 'Python 80%', variant: 'accent', style: { backgroundColor: 'color-mix(in oklab, var(--muted), var(--accent) 100%)' } },
      { label: 'Bourne Shell 20%', variant: 'accent', style: { backgroundColor: 'color-mix(in oklab, var(--muted), var(--accent) 25%)' } },
    ])
  })

  it('formats decimal percentages with dynamic color gradient', () => {
    const langPercents: Record<string, LanguagePercent[]> = {
      CI: [
        { language: 'Python', code: 805, percent: 80.5 },
        { language: 'Shell', code: 153, percent: 15.3 },
        { language: 'Markdown', code: 42, percent: 4.2 },
      ],
    }
    const [item] = projectAdapter([project], langPercents)
    expect(item.tags).toEqual([
      { label: 'Python 80.5%', variant: 'accent', style: { backgroundColor: 'color-mix(in oklab, var(--muted), var(--accent) 100%)' } },
      { label: 'Shell 15.3%', variant: 'accent', style: { backgroundColor: 'color-mix(in oklab, var(--muted), var(--accent) 19%)' } },
      { label: 'Markdown 4.2%', variant: 'accent', style: { backgroundColor: 'color-mix(in oklab, var(--muted), var(--accent) 5%)' } },
    ])
  })

  it('returns muted language tag when no code-stats', () => {
    const [item] = projectAdapter([project])
    expect(item.tags).toEqual([{ label: 'Python', variant: 'muted' }])
  })

  it('returns muted language tag when repo not in stats', () => {
    const langPercents: Record<string, LanguagePercent[]> = {
      OTHER: [
        { language: 'Python', code: 800, percent: 100 },
      ],
    }
    const [item] = projectAdapter([project], langPercents)
    expect(item.tags).toEqual([{ label: 'Python', variant: 'muted' }])
  })
})

describe('configAdapter', () => {
  const config: ConfigEntry = {
    name: 'banned_words',
    hasSchema: true,
    description: 'Words banned from source code.',
    fieldCount: 5,
  }

  it('converts config to CardItem with mono title', () => {
    const [item] = configAdapter([config])
    expect(item.id).toBe('banned_words')
    expect(item.title).toBe('banned_words')
    expect(item.monoTitle).toBe(true)
    expect(item.href).toBeUndefined()
    expect(item.icon).toBe('ri-settings-3-line')
    expect(item.meta).toEqual([{ label: 'Fields', value: '5' }])
    expect(item.category).toBe('Content Rules')
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
    hasSchema: true,
    description: 'Filesystem paths.',
    fieldCount: 3,
  }

  it('converts guard config to CardItem with shield icon', () => {
    const [item] = guardConfigAdapter([entry])
    expect(item.id).toBe('guard_paths')
    expect(item.title).toBe('guard_paths')
    expect(item.monoTitle).toBe(true)
    expect(item.href).toBeUndefined()
    expect(item.icon).toBe('ri-shield-keyhole-line')
    expect(item.meta).toEqual([{ label: 'Fields', value: '3' }])
    expect(item.category).toBe('Filesystem')
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

  it('converts pattern to CardItem with raw pattern id and no href', () => {
    const [item] = patternAdapter([pattern])
    expect(item.id).toBe('\\.parent\\.parent')
    expect(item.title).toBe('\\.parent\\.parent')
    expect(item.monoTitle).toBe(true)
    expect(item.href).toBeUndefined()
    expect(item.icon).toBe('ri-error-warning-line')
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
    expect(item.icon).toBe('ri-tools-line')
    expect(item.description).toBe('Extracts detector source code.')
    expect(item.category).toBe('Extraction')
    expect(item.tags).toEqual([
      { label: 'Extraction', variant: 'accent' },
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

describe('hookAdapter', () => {
  const hook: HookRecord = {
    id: 'check-unstaged',
    kind: 'shell',
    entry: 'ci_check_unstaged',
    stage: 'pre-commit',
    pass_filenames: false,
    always_run: true,
    mandatory: true,
    safety: true,
    applicable_to: ['any'],
  }
  const descriptions: Record<string, string> = {
    'check-unstaged': 'Fails the commit if there are unstaged files.',
  }

  it('converts hook to CardItem with description and mono title', () => {
    const [item] = hookAdapter([hook], descriptions)
    expect(item.id).toBe('check-unstaged')
    expect(item.title).toBe('check-unstaged')
    expect(item.monoTitle).toBe(true)
    expect(item.href).toBeUndefined()
    expect(item.icon).toBe('ri-git-commit-line')
    expect(item.description).toBe('Fails the commit if there are unstaged files.')
  })

  it('creates stage, kind, and tier tags', () => {
    const [item] = hookAdapter([hook], descriptions)
    expect(item.tags).toEqual([
      { label: 'Pre-commit', variant: 'accent' },
      { label: 'Shell', variant: 'muted' },
      { label: 'Safety tier', variant: 'ok' },
    ])
  })

  it('uses warn variant for strict-only hooks', () => {
    const [item] = hookAdapter([{ ...hook, safety: false }], descriptions)
    expect(item.tags![2]).toEqual({ label: 'Strict only', variant: 'warn' })
  })

  it('includes applicable_to in meta', () => {
    const [item] = hookAdapter([hook], descriptions)
    expect(item.meta).toEqual([
      { label: 'Applicable to', value: 'any' },
    ])
  })

  it('uses entry as description when no description is available', () => {
    const [item] = hookAdapter([hook], {})
    expect(item.description).toBe('ci_check_unstaged')
  })

  it('uses consistent icon for python_module kind', () => {
    const [item] = hookAdapter(
      [{ ...hook, kind: 'python_module' }],
      descriptions,
    )
    expect(item.icon).toBe('ri-git-commit-line')
  })

  it('uses consistent icon for makefile_target kind', () => {
    const [item] = hookAdapter(
      [{ ...hook, kind: 'makefile_target' }],
      descriptions,
    )
    expect(item.icon).toBe('ri-git-commit-line')
  })
})

describe('standardAdapter', () => {
  const standard: StandardEntry = {
    id: 'eu-ai-act',
    title: 'EU AI Act',
    fullTitle: 'Regulation (EU) 2024/1689',
    issuer: 'European Parliament',
    jurisdiction: 'EU',
    date: '2024-06-13',
    type: 'regulation',
    status: 'binding',
    summary: 'Comprehensive AI regulation.',
    tags: ['Risk Management'],
    free: true,
    downloadPath: '/standards/eu-ai-act.pdf',
    pages: 144,
  }

  it('converts standard to CardItem with category from type', () => {
    const [item] = standardAdapter([standard])
    expect(item.id).toBe('eu-ai-act')
    expect(item.title).toBe('EU AI Act')
    expect(item.subtitle).toBe('Regulation (EU) 2024/1689')
    expect(item.category).toBe('Regulation')
    expect(item.icon).toBe('ri-government-line')
  })

  it('creates jurisdiction, type, free/paid, and topic tags', () => {
    const [item] = standardAdapter([standard])
    expect(item.tags).toEqual([
      { label: 'EU', variant: 'accent' },
      { label: 'Regulation', variant: 'muted' },
      { label: 'FREE', variant: 'ok' },
      { label: 'Risk Management', variant: 'muted' },
    ])
  })

  it('uses PAID warn tag for paid standards', () => {
    const [item] = standardAdapter([{ ...standard, free: false, price: '$50' }])
    expect(item.tags![2]).toEqual({ label: 'PAID', variant: 'warn' })
  })

  it('uses stamp icon for executive-order type', () => {
    const [item] = standardAdapter([{ ...standard, type: 'executive-order' }])
    expect(item.icon).toBe('ri-stamp-line')
    expect(item.category).toBe('Executive Order')
  })
})

describe('deriveCategories', () => {
  it('extracts unique sorted categories from items', () => {
    const items = [
      { id: 'a', title: 'A', description: '', category: 'Zeta' },
      { id: 'b', title: 'B', description: '', category: 'Alpha' },
      { id: 'c', title: 'C', description: '', category: 'Zeta' },
    ]
    const result = deriveCategories(items)
    expect(result).toEqual([
      { id: 'Alpha', label: 'Alpha' },
      { id: 'Zeta', label: 'Zeta' },
    ])
  })

  it('skips items without category', () => {
    const items = [
      { id: 'a', title: 'A', description: '', category: 'Foo' },
      { id: 'b', title: 'B', description: '' },
    ]
    const result = deriveCategories(items)
    expect(result).toEqual([{ id: 'Foo', label: 'Foo' }])
  })

  it('returns empty array when no items have category', () => {
    const items = [
      { id: 'a', title: 'A', description: '' },
    ]
    const result = deriveCategories(items)
    expect(result).toEqual([])
  })
})
