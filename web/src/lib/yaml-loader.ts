import { cache } from 'react'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import type { BannedWordsConfig, SwallowPatternConfig } from '@/types/patterns'
import type { RequiredHooksConfig } from '@/types/hooks'
import type { ConfigSchema, ConfigEntry, GuardConfigEntry } from '@/types/content'
import type { ScriptManifest } from '@/types/wiki'
import type { StandardsConfig } from '@/types/standards'
import type { WikiLabelsConfig } from '@/types/wiki-labels'
import type { WikiPagesConfig } from '@/types/wiki-pages'
import {
  getConfigOverrideStems,
  getConfigRoot,
  getGuardConfigRoot,
  resolveConfigPath,
  resolveGuardConfigPath,
} from '@/lib/config-paths'

const DOCS_ROOT = process.env.WORKSPACE_CI_DOCS_ROOT
  ?? join(process.cwd(), '..', 'docs')

const SCRIPTS_ROOT = process.env.WORKSPACE_CI_SCRIPTS_ROOT
  ?? join(process.cwd(), '..', 'scripts')

export { getConfigRoot, getGuardConfigRoot }

export function getScriptsRoot(): string {
  return SCRIPTS_ROOT
}

export function getDocsRoot(): string {
  return DOCS_ROOT
}

export const getBannedPatterns = cache(async (): Promise<BannedWordsConfig> => {
  const raw = readFileSync(resolveConfigPath('banned_words'), 'utf8')
  return load(raw) as BannedWordsConfig
})

export interface PatternCategoryEntry {
  id: string
  label: string
}

export interface PatternCategoriesConfig {
  version: number
  categories: PatternCategoryEntry[]
}

export const getPatternCategories = cache(
  async (): Promise<PatternCategoriesConfig> => {
    const raw = readFileSync(resolveConfigPath('pattern_categories'), 'utf8')
    return load(raw) as PatternCategoriesConfig
  },
)

export const getSwallowPatterns = cache(async (): Promise<SwallowPatternConfig> => {
  const raw = readFileSync(resolveConfigPath('silent_swallow_patterns'), 'utf8')
  return load(raw) as SwallowPatternConfig
})

export const getStandards = cache(async (): Promise<StandardsConfig> => {
  const raw = readFileSync(resolveConfigPath('standards'), 'utf8')
  return load(raw) as StandardsConfig
})

export function getStandardsSync(): StandardsConfig {
  const raw = readFileSync(resolveConfigPath('standards'), 'utf8')
  return load(raw) as StandardsConfig
}

let _wikiLabelsCache: WikiLabelsConfig | null = null

export function getWikiLabels(): WikiLabelsConfig {
  if (_wikiLabelsCache) return _wikiLabelsCache
  const raw = readFileSync(resolveConfigPath('wiki_labels'), 'utf8')
  _wikiLabelsCache = load(raw) as WikiLabelsConfig
  return _wikiLabelsCache
}

export function getWikiPages(): WikiPagesConfig {
  const raw = readFileSync(resolveConfigPath('wiki_pages'), 'utf8')
  return load(raw) as WikiPagesConfig
}

export const getRequiredHooks = cache(async (): Promise<RequiredHooksConfig> => {
  const raw = readFileSync(resolveConfigPath('required_hooks'), 'utf8')
  return load(raw) as RequiredHooksConfig
})

export const getConfigSchema = cache(
  async (name: string): Promise<ConfigSchema | null> => {
    const p = resolveConfigPath(`${name}.schema`)
    try {
      return load(readFileSync(p, 'utf8')) as ConfigSchema
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  },
)

export const getConfigValue = cache(
  async (name: string): Promise<Record<string, unknown>> => {
    const raw = readFileSync(resolveConfigPath(name), 'utf8')
    return load(raw) as Record<string, unknown>
  },
)

export function getConfigRawYaml(name: string): string {
  return readFileSync(resolveConfigPath(name), 'utf8')
}

export const getConfigIndex = cache(async (): Promise<ConfigEntry[]> => {
  const names = new Set<string>()
  try {
    for (const file of readdirSync(getConfigRoot())) {
      if (
        file.endsWith('.yaml') &&
        !file.endsWith('.schema.yaml') &&
        !file.includes('banned_words_exceptions')
      ) {
        names.add(file.replace(/\.yaml$/, ''))
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  for (const stem of getConfigOverrideStems()) {
    names.add(stem)
  }

  return [...names]
    .map((name): ConfigEntry => {
      const schemaPath = resolveConfigPath(`${name}.schema`)
      const hasSchema = existsSync(schemaPath)
      const entry: ConfigEntry = { name, hasSchema }
      if (hasSchema) {
        try {
          const schema = load(
            readFileSync(schemaPath, 'utf8'),
          ) as ConfigSchema
          if (schema.description) entry.description = schema.description
          if (schema.fields) entry.fieldCount = schema.fields.length
        } catch {
          // schema exists but is malformed; still include the entry
        }
      }
      return entry
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

export const getScriptManifest = cache(async (): Promise<ScriptManifest> => {
  const raw = readFileSync(join(SCRIPTS_ROOT, 'manifest.yaml'), 'utf8')
  return load(raw) as ScriptManifest
})

export const getGuardConfigIndex = cache(async (): Promise<string[]> => {
  try {
    const entries = readdirSync(getGuardConfigRoot())
    const names = new Set(
      entries
        .filter(
          (f) =>
            f.startsWith('guard_') &&
            f.endsWith('.yaml') &&
            !f.endsWith('.schema.yaml'),
        )
        .map((f) => f.replace(/\.yaml$/, '')),
    )
    for (const stem of getConfigOverrideStems(true)) {
      names.add(stem)
    }
    return [...names].sort()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return getConfigOverrideStems(true).sort()
    }
    throw e
  }
})

export const getGuardConfig = cache(
  async (name: string): Promise<Record<string, unknown>> => {
    const raw = readFileSync(resolveGuardConfigPath(name), 'utf8')
    return load(raw) as Record<string, unknown>
  },
)

export function getGuardConfigRawYaml(name: string): string {
  return readFileSync(resolveGuardConfigPath(name), 'utf8')
}

export const getGuardConfigSchema = cache(
  async (name: string): Promise<ConfigSchema | null> => {
    const p = resolveGuardConfigPath(`${name}.schema`)
    try {
      return load(readFileSync(p, 'utf8')) as ConfigSchema
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  },
)

export function getGuardConfigEntries(names: string[]): GuardConfigEntry[] {
  return names.map((name): GuardConfigEntry => {
    const schemaPath = resolveGuardConfigPath(`${name}.schema`)
    const hasSchema = existsSync(schemaPath)
    const entry: GuardConfigEntry = {
      name,
      title: name
        .replace(/^guard_/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      hasSchema,
    }
    if (hasSchema) {
      try {
        const schema = load(
          readFileSync(schemaPath, 'utf8'),
        ) as ConfigSchema
        if (schema.description) entry.description = schema.description
        if (schema.fields) entry.fieldCount = schema.fields.length
      } catch {
        // schema exists but is malformed; still include the entry
      }
    }
    return entry
  })
}