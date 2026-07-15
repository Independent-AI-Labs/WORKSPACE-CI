import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getConfigRoot,
  resolveConfigPath,
  getConfigOverrideStems,
} from '@/lib/config-paths'

describe('resolveConfigPath', () => {
  const savedEnv: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const key of Object.keys(savedEnv)) {
      const value = savedEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
      delete savedEnv[key]
    }
  })

  function setEnv(key: string, value: string | undefined) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  it('prefers per-file env override over manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-env-'))
    const envFile = join(dir, 'env.yaml')
    const manifestFile = join(dir, 'manifest.yaml')
    writeFileSync(envFile, 'version: 1\n')
    writeFileSync(manifestFile, `banned_words: ${join(dir, 'manifest.yaml')}\n`)
    writeFileSync(join(dir, 'manifest.yaml'), 'version: 1\n')

    setEnv('CI_CONFIG_PATH_BANNED_WORDS', envFile)
    setEnv('CI_CONFIG_OVERRIDES', manifestFile)

    expect(resolveConfigPath('banned_words')).toBe(envFile)
  })

  it('uses manifest override when env is unset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-manifest-'))
    const overrideFile = join(dir, 'override.yaml')
    const manifestFile = join(dir, 'overrides.yaml')
    writeFileSync(overrideFile, 'version: 1\n')
    writeFileSync(manifestFile, 'banned_words: override.yaml\n')

    setEnv('CI_CONFIG_PATH_BANNED_WORDS', undefined)
    setEnv('CI_CONFIG_OVERRIDES', manifestFile)
    setEnv('CI_CONFIG_DIR', join(dir, 'empty-config'))
    mkdirSync(join(dir, 'empty-config'))

    expect(resolveConfigPath('banned_words')).toBe(overrideFile)
    expect(getConfigOverrideStems()).toContain('banned_words')
  })

  it('uses CI_CONFIG_DIR alias for config root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-root-'))
    const configDir = join(dir, 'config')
    mkdirSync(configDir)
    writeFileSync(join(configDir, 'projects.yaml'), 'version: 1\nprojects: []\n')

    setEnv('CI_CONFIG_DIR', configDir)
    setEnv('WORKSPACE_CI_CONFIG_ROOT', undefined)
    setEnv('CI_CONFIG_OVERRIDES', undefined)

    expect(getConfigRoot()).toBe(configDir)
    expect(resolveConfigPath('projects')).toBe(join(configDir, 'projects.yaml'))
  })
})