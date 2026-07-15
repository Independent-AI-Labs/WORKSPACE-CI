import { describe, it, expect, afterEach, vi } from 'vitest'
import { isHomeLandingEnabled } from '@/lib/feature-flags'

describe('isHomeLandingEnabled', () => {
  const original = process.env.WIKI_HOME_LANDING_ENABLED

  afterEach(() => {
    vi.unstubAllEnvs()
    if (original === undefined) {
      delete process.env.WIKI_HOME_LANDING_ENABLED
    } else {
      process.env.WIKI_HOME_LANDING_ENABLED = original
    }
  })

  it('returns false when unset in development', () => {
    vi.stubEnv('WIKI_HOME_LANDING_ENABLED', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(isHomeLandingEnabled()).toBe(false)
  })

  it('returns false when unset in production', () => {
    vi.stubEnv('WIKI_HOME_LANDING_ENABLED', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(isHomeLandingEnabled()).toBe(false)
  })

  it('returns true for true/1/yes', () => {
    process.env.WIKI_HOME_LANDING_ENABLED = 'true'
    expect(isHomeLandingEnabled()).toBe(true)
    process.env.WIKI_HOME_LANDING_ENABLED = '1'
    expect(isHomeLandingEnabled()).toBe(true)
    process.env.WIKI_HOME_LANDING_ENABLED = 'YES'
    expect(isHomeLandingEnabled()).toBe(true)
  })

  it('returns false for other values', () => {
    process.env.WIKI_HOME_LANDING_ENABLED = 'false'
    expect(isHomeLandingEnabled()).toBe(false)
  })
})