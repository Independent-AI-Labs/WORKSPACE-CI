import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load } from 'js-yaml'
import type { WikiLabelsConfig } from '@/types/wiki-labels'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const configDir = join(repoRoot, 'config')

describe('wiki_labels config coverage', () => {
  it('every config file on the hook-configs page has a category label', () => {
    const labels = load(readFileSync(join(configDir, 'wiki_labels.yaml'), 'utf8')) as WikiLabelsConfig
    const stems = readdirSync(configDir)
      .filter(
        (f) =>
          f.endsWith('.yaml') && !f.endsWith('.schema.yaml') && !f.includes('banned_words_exceptions')
      )
      .map((f) => f.replace(/\.yaml$/, ''))
    const missing = stems.filter((s) => labels.config_categories[s] === undefined)
    expect(missing).toEqual([])
  })

  it('every config file has a schema with a description (configAdapter invariant)', () => {
    const stems = readdirSync(configDir)
      .filter(
        (f) =>
          f.endsWith('.yaml') && !f.endsWith('.schema.yaml') && !f.includes('banned_words_exceptions')
      )
      .map((f) => f.replace(/\.yaml$/, ''))
    const missing = stems.filter((s) => {
      const schemaPath = join(configDir, `${s}.schema.yaml`)
      if (!existsSync(schemaPath)) return true
      const schema = load(readFileSync(schemaPath, 'utf8')) as { description?: string }
      return !schema?.description
    })
    expect(missing).toEqual([])
  })
})
