import { cache } from 'react'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import type { SearchIndexEntry } from '@/types/wiki'
import type { BannedWordsConfig, SwallowPatternConfig } from '@/types/patterns'
import type { RequiredHooksConfig } from '@/types/hooks'
import type { ScriptManifest } from '@/types/wiki'
import { classifyAll, classifySwallowPatterns } from '@/lib/patterns'
import {
  buildSearchIndexFromPatterns,
  buildSearchIndexFromHooks,
} from '@/lib/search-index'
import {
  getConfigRoot,
  getScriptsRoot,
  getGuardConfigRoot,
  getGuardConfigEntries,
} from '@/lib/yaml-loader'
import { loadSwallowDetectors, loadHookDescriptions, loadStandards } from '@/lib/docs-loader'
import { PROJECTS } from '@/lib/project-registry'

function loadPatterns(): SearchIndexEntry[] {
  try {
    const bannedRaw = readFileSync(
      join(getConfigRoot(), 'banned_words.yaml'),
      'utf8',
    )
    const bannedConfig = load(bannedRaw) as BannedWordsConfig
    const bannedPatterns = classifyAll(bannedConfig)

    let swallowPatterns: ReturnType<typeof classifySwallowPatterns> = []
    try {
      const swallowRaw = readFileSync(
        join(getConfigRoot(), 'silent_swallow_patterns.yaml'),
        'utf8',
      )
      const swallowConfig = load(swallowRaw) as SwallowPatternConfig
      const detectorData = loadSwallowDetectors()
      swallowPatterns = classifySwallowPatterns(swallowConfig, detectorData)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }

    return buildSearchIndexFromPatterns([...bannedPatterns, ...swallowPatterns])
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

function loadHooks(): SearchIndexEntry[] {
  try {
    const raw = readFileSync(
      join(getConfigRoot(), 'required_hooks.yaml'),
      'utf8',
    )
    const config = load(raw) as RequiredHooksConfig
    const descriptions = loadHookDescriptions()
    return buildSearchIndexFromHooks(
      config.hooks,
      descriptions?.descriptions ?? undefined,
    )
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

function loadConfigs(): SearchIndexEntry[] {
  try {
    const entries = readdirSync(getConfigRoot())
    return entries
      .filter(
        (f) =>
          f.endsWith('.yaml') &&
          !f.endsWith('.schema.yaml') &&
          !f.includes('banned_words_exceptions'),
      )
      .map((f) => {
        const name = f.replace(/\.yaml$/, '')
        return {
          id: `config-${name}`,
          title: name,
          section: 'Configuration',
          content: `Configuration file: ${name}`,
          href: `/config#${name}`,
          type: 'config' as const,
          keywords: [name],
        }
      })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

function loadGuardConfigs(): SearchIndexEntry[] {
  try {
    const entries = readdirSync(getGuardConfigRoot())
    const names = entries
      .filter(
        (f) =>
          f.startsWith('guard_') &&
          f.endsWith('.yaml') &&
          !f.endsWith('.schema.yaml'),
      )
      .map((f) => f.replace(/\.yaml$/, ''))
      .sort()
    return getGuardConfigEntries(names).map((g) => ({
      id: `guard-${g.name}`,
      title: g.title,
      section: 'Guard',
      content: `Guard configuration: ${g.title}`,
      href: `/guard#${g.name}`,
      type: 'guard' as const,
      keywords: [g.name, g.title],
    }))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

function loadStandardsSearch(): SearchIndexEntry[] {
  const standards = loadStandards()
  if (!standards) return []
  return standards.map((s) => ({
    id: `standard-${s.id}`,
    title: s.title,
    section: 'Standards',
    content: `${s.summary} Issuer: ${s.issuer}, Jurisdiction: ${s.jurisdiction}, Type: ${s.type}, Status: ${s.status}.`,
    href: `/standards#${s.id}`,
    type: 'standard' as const,
    keywords: [
      s.id,
      s.title,
      s.fullTitle,
      s.issuer,
      s.jurisdiction,
      s.type,
      s.status,
      ...s.tags,
    ],
  }))
}

function loadScriptsSearch(): SearchIndexEntry[] {
  try {
    const raw = readFileSync(join(getScriptsRoot(), 'manifest.yaml'), 'utf8')
    const manifest = load(raw) as ScriptManifest
    return manifest.scripts.map((s) => ({
      id: `script-${s.id}`,
      title: s.id,
      section: 'Tooling',
      content: `${s.summary} Category: ${s.category}. Usage: ${s.usage}. Output: ${s.output}.`,
      href: `/tooling#${s.id}`,
      type: 'tooling' as const,
      keywords: [s.id, s.category, s.make_target ?? ''].filter(Boolean),
    }))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

const staticPages: SearchIndexEntry[] = [
  {
    id: 'page-home',
    title: 'Home',
    section: 'Pages',
    content: 'Project catalogue: browse READMEs for all backend projects',
    href: '/',
    type: 'page',
    keywords: ['home', 'catalogue', 'projects', 'readme'],
  },
  {
    id: 'page-patterns',
    title: 'Code Anti-Patterns',
    section: 'Pages',
    content: 'Banned words and patterns reference',
    href: '/patterns',
    type: 'page',
    keywords: ['patterns', 'banned', 'words'],
  },
  {
    id: 'page-hooks',
    title: 'Git Hooks',
    section: 'Pages',
    content: 'Required git hooks reference',
    href: '/hooks',
    type: 'page',
    keywords: ['hooks', 'pre-commit', 'git'],
  },
  {
    id: 'page-config',
    title: 'Config Files',
    section: 'Pages',
    content: 'Configuration files reference',
    href: '/config',
    type: 'page',
    keywords: ['config', 'configuration'],
  },
  {
    id: 'page-guard',
    title: 'Guard Policies',
    section: 'Pages',
    content: 'Guard configurations reference',
    href: '/guard',
    type: 'page',
    keywords: ['guard', 'config'],
  },
  {
    id: 'page-runtime-hooks',
    title: 'Runtime Hooks',
    section: 'Pages',
    content: 'Runtime hooks for AI agent execution monitoring',
    href: '/runtime-hooks',
    type: 'page',
    keywords: ['runtime', 'hooks', 'monitoring', 'audit'],
  },
  {
    id: 'page-llm-gateway',
    title: 'LLM Gateway',
    section: 'Pages',
    content: 'Gateway for routing, auditing, and governing LLM API calls',
    href: '/llm-gateway',
    type: 'page',
    keywords: ['llm', 'gateway', 'routing', 'audit', 'token'],
  },
  {
    id: 'page-checks',
    title: 'Static Analysis',
    section: 'Pages',
    content: 'CI checks reference',
    href: '/checks',
    type: 'page',
    keywords: ['checks', 'ci'],
  },
  {
    id: 'page-tooling',
    title: 'Tools & Scripts',
    section: 'Pages',
    content: 'Tooling and scripts reference',
    href: '/tooling',
    type: 'page',
    keywords: ['tooling', 'scripts', 'make'],
  },
  {
    id: 'page-standards',
    title: 'Standards & Regulations',
    section: 'Pages',
    content: 'AI standards, regulations, frameworks, and declarations',
    href: '/standards',
    type: 'page',
    keywords: ['standards', 'regulations', 'eu ai act', 'nist', 'oecd', 'unesco', 'iso', 'ieee', 'g7', 'un', 'coe'],
  },
  {
    id: 'page-integration',
    title: 'Integration Guide',
    section: 'Pages',
    content: 'Integration guide',
    href: '/integration',
    type: 'page',
    keywords: ['integration', 'ci', 'setup'],
  },
  {
    id: 'page-playground',
    title: 'Playground',
    section: 'Pages',
    content: 'Pattern testing playground',
    href: '/playground',
    type: 'page',
    keywords: ['playground', 'test', 'regex'],
  },
  ...PROJECTS.map((p) => ({
    id: `project-${p.slug}`,
    title: p.displayName,
    section: 'Projects',
    content: `${p.displayName} README documentation (${p.language})`,
    href: `/${p.slug}`,
    type: 'project' as const,
    keywords: [p.slug, p.displayName, p.language],
  })),
]

export const buildSearchData = cache((): SearchIndexEntry[] => {
  return [
    ...loadPatterns(),
    ...loadHooks(),
    ...loadConfigs(),
    ...loadGuardConfigs(),
    ...loadStandardsSearch(),
    ...loadScriptsSearch(),
    ...staticPages,
  ]
})

export interface WikiStats {
  hooks: number
  patterns: number
  configs: number
  guards: number
  standards: number
  scripts: number
}

export const getWikiStats = cache((): WikiStats => {
  const data = buildSearchData()
  return {
    hooks: data.filter((d) => d.type === 'hook').length,
    patterns: data.filter((d) => d.type === 'pattern').length,
    configs: data.filter((d) => d.type === 'config').length,
    guards: data.filter((d) => d.type === 'guard').length,
    standards: data.filter((d) => d.type === 'standard').length,
    scripts: data.filter((d) => d.type === 'tooling').length,
  }
})
