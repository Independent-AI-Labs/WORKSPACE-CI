import { describe, it, expect } from 'vitest'
import { parseLandingPostsConfig } from '@/lib/landing-posts'

const minimal = {
  version: 1,
  ui: {
    missing_content_message: 'Missing',
    source_link_label: 'Source',
    carousel_aria_label: 'Carousel',
    post_tab_aria_label_template: 'Post {n}: {title}',
  },
  mission: {
    headline: 'Test',
    summary: 'Summary',
  },
  settings: {
    post_interval_ms: 30000,
    slide_interval_ms: 7000,
    transition_ms: 1200,
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
    expect(config.ui.source_link_label).toBe('Source')
    expect(config.posts).toHaveLength(1)
    expect(config.posts[0].slides[0].type).toBe('image')
  })

  it('accepts document slides with source_url', () => {
    const config = parseLandingPostsConfig({
      ...minimal,
      posts: [
        {
          id: 'sov',
          title: 'Sovereignty',
          slides: [
            {
              type: 'document',
              src: '/landing/sovereignty/doc.pdf',
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

  it('requires ui block', () => {
    expect(() => parseLandingPostsConfig({ ...minimal, ui: undefined })).toThrow()
  })

  it('rejects empty posts', () => {
    expect(() => parseLandingPostsConfig({ ...minimal, posts: [] })).toThrow()
  })
})