import { describe, it, expect } from 'vitest'
import { parseLandingPostsConfig } from '@/lib/landing-posts'

const minimal = {
  version: 1,
  mission: {
    headline: 'Test',
    summary: 'Summary',
    products: [{ slug: 'workspace-ci', blurb: 'CI' }],
  },
  posts: [
    {
      id: 'a',
      title: 'Post A',
      slides: [
        { type: 'image', src: '/landing/a.png', subtitle: 'Sub', content: 'Body' },
      ],
    },
  ],
}

describe('parseLandingPostsConfig', () => {
  it('parses valid config', () => {
    const config = parseLandingPostsConfig(minimal)
    expect(config.mission.headline).toBe('Test')
    expect(config.posts).toHaveLength(1)
    expect(config.posts[0].slides[0].type).toBe('image')
    expect(config.settings.slide_interval_ms).toBe(7000)
  })

  it('accepts iframe slides with source_url', () => {
    const config = parseLandingPostsConfig({
      ...minimal,
      posts: [
        {
          id: 'sov',
          title: 'Sovereignty',
          slides: [
            {
              type: 'iframe',
              src: 'https://eur-lex.europa.eu/example',
              source_url: 'https://eur-lex.europa.eu/example',
              subtitle: 'EU',
              content: 'Text',
            },
          ],
        },
      ],
    })
    expect(config.posts[0].slides[0].source_url).toContain('eur-lex')
  })

  it('rejects empty posts', () => {
    expect(() => parseLandingPostsConfig({ ...minimal, posts: [] })).toThrow()
  })
})