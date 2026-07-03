import { describe, it, expect } from 'vitest'
import { buildSearchData } from '@/lib/search-data'

describe('buildSearchData', () => {
  const data = buildSearchData()

  it('returns a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('includes pattern entries', () => {
    const patterns = data.filter((e) => e.type === 'pattern')
    expect(patterns.length).toBeGreaterThan(0)
  })

  it('includes hook entries', () => {
    const hooks = data.filter((e) => e.type === 'hook')
    expect(hooks.length).toBeGreaterThan(0)
  })

  it('includes page entries', () => {
    const pages = data.filter((e) => e.type === 'page')
    expect(pages.length).toBeGreaterThan(0)
  })

  it('all entries have required fields', () => {
    for (const entry of data) {
      expect(entry.id).toBeTruthy()
      expect(entry.title).toBeTruthy()
      expect(entry.section).toBeTruthy()
      expect(entry.content).toBeTruthy()
      expect(entry.href).toBeTruthy()
      expect(entry.type).toBeTruthy()
      expect(Array.isArray(entry.keywords)).toBe(true)
    }
  })

  it('all hrefs start with /', () => {
    for (const entry of data) {
      expect(entry.href.startsWith('/')).toBe(true)
    }
  })

  it('all ids are unique', () => {
    const ids = data.map((e) => e.id)
    const unique = new Set(ids)
    expect(ids.length).toBe(unique.size)
  })
})
