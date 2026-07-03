import { cache } from 'react'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import type { BannedWordsConfig, SwallowPatternConfig } from '@/types/patterns'
import type { RequiredHooksConfig } from '@/types/hooks'
import type { ConfigSchema, ConfigEntry, GuardConfigEntry } from '@/types/content'
import type { ScriptManifest } from '@/types/wiki'

const CONFIG_ROOT = process.env.WORKSPACE_CI_CONFIG_ROOT
  ?? join(process.cwd(), '..', 'config')

const DOCS_ROOT = process.env.WORKSPACE_CI_DOCS_ROOT
  ?? join(process.cwd(), '..', 'docs')

const SCRIPTS_ROOT = process.env.WORKSPACE_CI_SCRIPTS_ROOT
  ?? join(process.cwd(), '..', 'scripts')

const GUARD_CONFIG_ROOT = process.env.WORKSPACE_GUARD_CONFIG_ROOT
  ?? join(process.cwd(), '..', '..', 'WORKSPACE-GUARD', 'config')

export function getConfigRoot(): string {
  return CONFIG_ROOT
}

export function getDocsRoot(): string {
  return DOCS_ROOT
}

export function getGuardConfigRoot(): string {
  return GUARD_CONFIG_ROOT
}

export const getBannedPatterns = cache(async (): Promise<BannedWordsConfig> => {
  const raw = readFileSync(join(CONFIG_ROOT, 'banned_words.yaml'), 'utf8')
  return load(raw) as BannedWordsConfig
})

export const getSwallowPatterns = cache(async (): Promise<SwallowPatternConfig> => {
  const raw = readFileSync(
    join(CONFIG_ROOT, 'silent_swallow_patterns.yaml'),
    'utf8',
  )
  return load(raw) as SwallowPatternConfig
})

export const getRequiredHooks = cache(async (): Promise<RequiredHooksConfig> => {
  const raw = readFileSync(join(CONFIG_ROOT, 'required_hooks.yaml'), 'utf8')
  return load(raw) as RequiredHooksConfig
})

export const getConfigSchema = cache(
  async (name: string): Promise<ConfigSchema | null> => {
    const p = join(CONFIG_ROOT, `${name}.schema.yaml`)
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
    const p = join(CONFIG_ROOT, `${name}.yaml`)
    const raw = readFileSync(p, 'utf8')
    return load(raw) as Record<string, unknown>
  },
)

export const getConfigIndex = cache(async (): Promise<ConfigEntry[]> => {
  const entries = readdirSync(CONFIG_ROOT)
  return entries
    .filter(
      (f) =>
        f.endsWith('.yaml') &&
        !f.endsWith('.schema.yaml') &&
        !f.includes('banned_words_exceptions'),
    )
    .map((f) => {
      const name = f.replace(/\.yaml$/, '')
      const hasSchema = existsSync(join(CONFIG_ROOT, `${name}.schema.yaml`))
      return { name, hasSchema, link: `/config/${name}` }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

export const getScriptManifest = cache(async (): Promise<ScriptManifest> => {
  const raw = readFileSync(join(SCRIPTS_ROOT, 'manifest.yaml'), 'utf8')
  return load(raw) as ScriptManifest
})

export const getGuardConfigIndex = cache(async (): Promise<string[]> => {
  try {
    const entries = readdirSync(GUARD_CONFIG_ROOT)
    return entries
      .filter(
        (f) =>
          f.startsWith('guard_') &&
          f.endsWith('.yaml') &&
          !f.endsWith('.schema.yaml'),
      )
      .map((f) => f.replace(/\.yaml$/, ''))
      .sort()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
})

export const getGuardConfig = cache(
  async (name: string): Promise<Record<string, unknown>> => {
    const raw = readFileSync(join(GUARD_CONFIG_ROOT, `${name}.yaml`), 'utf8')
    return load(raw) as Record<string, unknown>
  },
)

export const getGuardConfigSchema = cache(
  async (name: string): Promise<ConfigSchema | null> => {
    const p = join(GUARD_CONFIG_ROOT, `${name}.schema.yaml`)
    try {
      return load(readFileSync(p, 'utf8')) as ConfigSchema
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  },
)

export function getGuardConfigEntries(names: string[]): GuardConfigEntry[] {
  return names.map((name) => ({
    name,
    title: name
      .replace(/^guard_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    link: `/guard/${name}`,
  }))
}
