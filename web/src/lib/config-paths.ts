import { existsSync, readFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { cwd } from 'process'
import { load } from 'js-yaml'

function normalizeStem(name: string): string {
  return name.replace(/\.ya?ml$/, '')
}

function configPathEnvVar(stem: string, guard = false): string {
  const normalized = normalizeStem(stem).toUpperCase().replace(/-/g, '_')
  return guard ? `CI_GUARD_CONFIG_PATH_${normalized}` : `CI_CONFIG_PATH_${normalized}`
}

export function getConfigRoot(): string {
  const env = process.env.CI_CONFIG_DIR ?? process.env.WORKSPACE_CI_CONFIG_ROOT
  if (env) return resolve(env)
  return resolve(cwd(), '..', 'config')
}

export function getGuardConfigRoot(): string {
  const env =
    process.env.CI_GUARD_CONFIG_DIR ?? process.env.WORKSPACE_GUARD_CONFIG_ROOT
  if (env) return resolve(env)
  return resolve(cwd(), '..', '..', 'WORKSPACE-GUARD', 'config')
}

function parseOverrideManifest(manifestPath: string): Record<string, string> {
  const raw = load(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const entries =
    raw && typeof raw === 'object' && 'overrides' in raw
      ? (raw.overrides as Record<string, unknown>)
      : raw
  if (!entries || typeof entries !== 'object') return {}

  const baseDir = dirname(resolve(manifestPath))
  const resolved: Record<string, string> = {}
  for (const [key, value] of Object.entries(entries)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue
    const stem = normalizeStem(key)
    const candidate = isAbsolute(value) ? value : join(baseDir, value)
    resolved[stem] = resolve(candidate)
  }
  return resolved
}

function loadOverrideManifest(guard: boolean): Record<string, string> {
  const envKey = guard ? 'CI_GUARD_CONFIG_OVERRIDES' : 'CI_CONFIG_OVERRIDES'
  const manifest = process.env[envKey]
  if (!manifest) return {}
  return parseOverrideManifest(manifest)
}

export function getConfigOverrideStems(guard = false): string[] {
  return Object.keys(loadOverrideManifest(guard))
}

export function resolveConfigPath(stem: string, consumerPath?: string): string {
  const normalized = normalizeStem(stem)
  const envValue = process.env[configPathEnvVar(normalized)]
  if (envValue) return resolve(envValue)

  const manifest = loadOverrideManifest(false)
  if (manifest[normalized]) return manifest[normalized]

  const defaultPath = join(getConfigRoot(), `${normalized}.yaml`)
  if (existsSync(defaultPath)) return defaultPath

  if (consumerPath) {
    const localPath = isAbsolute(consumerPath)
      ? consumerPath
      : resolve(cwd(), consumerPath)
    if (existsSync(localPath)) return localPath
  }

  return defaultPath
}

export function resolveGuardConfigPath(stem: string): string {
  const normalized = normalizeStem(stem)
  const envValue = process.env[configPathEnvVar(normalized, true)]
  if (envValue) return resolve(envValue)

  const manifest = loadOverrideManifest(true)
  if (manifest[normalized]) return manifest[normalized]

  return join(getGuardConfigRoot(), `${normalized}.yaml`)
}