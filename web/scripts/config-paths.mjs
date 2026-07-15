import { existsSync, readFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { cwd } from 'process'
import { load } from 'js-yaml'

function normalizeStem(name) {
  return name.replace(/\.ya?ml$/, '')
}

function configPathEnvVar(stem, guard = false) {
  const normalized = normalizeStem(stem).toUpperCase().replace(/-/g, '_')
  return guard ? `CI_GUARD_CONFIG_PATH_${normalized}` : `CI_CONFIG_PATH_${normalized}`
}

export function getConfigRoot() {
  const env = process.env.CI_CONFIG_DIR ?? process.env.WORKSPACE_CI_CONFIG_ROOT
  if (env) return resolve(env)
  return resolve(cwd(), '..', 'config')
}

function parseOverrideManifest(manifestPath) {
  const raw = load(readFileSync(manifestPath, 'utf8'))
  const entries = raw && typeof raw === 'object' && 'overrides' in raw
    ? raw.overrides
    : raw
  if (!entries || typeof entries !== 'object') return {}

  const baseDir = dirname(resolve(manifestPath))
  const resolved = {}
  for (const [key, value] of Object.entries(entries)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue
    const stem = normalizeStem(key)
    const candidate = isAbsolute(value) ? value : join(baseDir, value)
    resolved[stem] = resolve(candidate)
  }
  return resolved
}

function loadOverrideManifest() {
  const manifest = process.env.CI_CONFIG_OVERRIDES
  if (!manifest) return {}
  return parseOverrideManifest(manifest)
}

export function resolveConfigPath(stem, consumerPath) {
  const normalized = normalizeStem(stem)
  const envValue = process.env[configPathEnvVar(normalized)]
  if (envValue) return resolve(envValue)

  const manifest = loadOverrideManifest()
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