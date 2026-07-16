import { describe, it, expect } from 'vitest'
import {
  parseLandingPostsConfig,
  resolveSubtitleColor,
  resolveSubtitleIcon,
  isInternalSourceUrl,
  isExternalSourceUrl,
} from '@/lib/landing-posts'

const minimal = {
  version: 1,
  ui: {
    missing_content_message: 'Missing',
    source_link_label: 'Source',
    download_link_label: 'Download PDF',
    solutions_link_prefix: 'Browse solutions:',
    resources_link_prefix: 'Resources:',
    carousel_aria_label: 'Carousel',
    slide_tab_aria_label_template: 'Page {n} of {total}',
    prev_slide_aria_label: 'Previous page',
    next_slide_aria_label: 'Next page',
    posts_tablist_aria_label: 'Featured posts',
    post_tab_aria_label_template: '{label}',
    post_tabs_scroll_prev_aria_label: 'Scroll tabs left',
    post_tabs_scroll_next_aria_label: 'Scroll tabs right',
  },
  hero: {
    intro: 'Unified wiki intro text.',
  },
  mission: {
    headline: 'Test',
    summary: 'Summary',
  },
  settings: {
    post_interval_ms: 30000,
    slide_interval_ms: 7000,
    transition_ms: 1200,
    background_pan_duration_ms: 18000,
  },
  posts: [
    {
      id: 'a',
      tab_label: 'Alpha',
      title: 'Post A',
      slides: [
        { type: 'image', src: '/landing/a.png', subtitle: 'Sub', content: 'Body' },
      ],
    },
  ],
}

describe('parseLandingPostsConfig', () => {
  it('derives text_transition_ms when omitted', () => {
    const config = parseLandingPostsConfig(minimal)
    expect(config.settings.text_transition_ms).toBe(480)
  })

  it('defaults link section prefixes when omitted', () => {
    const { solutions_link_prefix: _s, resources_link_prefix: _r, ...ui } = minimal.ui
    const config = parseLandingPostsConfig({ ...minimal, ui })
    expect(config.ui.solutions_link_prefix).toBe('Browse solutions:')
    expect(config.ui.resources_link_prefix).toBe('Resources:')
  })

  it('defaults post tab scroll aria labels when omitted', () => {
    const { post_tabs_scroll_prev_aria_label: _p, post_tabs_scroll_next_aria_label: _n, ...ui } =
      minimal.ui
    const config = parseLandingPostsConfig({ ...minimal, ui })
    expect(config.ui.post_tabs_scroll_prev_aria_label).toBe('Scroll tabs left')
    expect(config.ui.post_tabs_scroll_next_aria_label).toBe('Scroll tabs right')
  })

  it('parses explicit text_transition_ms', () => {
    const config = parseLandingPostsConfig({
      ...minimal,
      settings: { ...minimal.settings, text_transition_ms: 450 },
    })
    expect(config.settings.text_transition_ms).toBe(450)
  })

  it('parses valid config', () => {
    const config = parseLandingPostsConfig(minimal)
    expect(config.hero.intro).toContain('Unified wiki')
    expect(config.mission.headline).toBe('Test')
    expect(config.ui.source_link_label).toBe('Source')
    expect(config.settings.background_pan_duration_ms).toBe(18000)
    expect(config.posts).toHaveLength(1)
    expect(config.posts[0].tab_label).toBe('Alpha')
    expect(config.posts[0].slides[0].type).toBe('image')
  })

  it('accepts internal source_url on image slides', () => {
    const config = parseLandingPostsConfig({
      ...minimal,
      posts: [
        {
          id: 'clankers',
          title: 'Clankers',
          slides: [
            {
              type: 'image',
              src: '/landing/clankers/grok-bad.png',
              source_url: '/hooks',
              source_label: 'Git Hooks',
              subtitle: 'Unbounded agents',
              content: 'Body',
            },
          ],
        },
      ],
    })
    expect(config.posts[0].slides[0].source_url).toBe('/hooks')
    expect(config.posts[0].slides[0].source_label).toBe('Git Hooks')
  })

  it('parses optional subtitle_icon remix classes', () => {
    const config = parseLandingPostsConfig({
      ...minimal,
      posts: [
        {
          id: 'a',
          title: 'Post A',
          slides: [
            {
              type: 'image',
              src: '/landing/a.png',
              subtitle: 'Sub',
              subtitle_icon: 'ri-error-warning-line',
              content: 'Body',
            },
          ],
        },
      ],
    })
    expect(config.posts[0].slides[0].subtitle_icon).toBe('ri-error-warning-line')
  })

  it('rejects invalid subtitle_icon values', () => {
    expect(() =>
      parseLandingPostsConfig({
        ...minimal,
        posts: [
          {
            id: 'a',
            title: 'Post A',
            slides: [
              {
                type: 'image',
                src: '/landing/a.png',
                subtitle: 'Sub',
                subtitle_icon: 'fa-warning',
                content: 'Body',
              },
            ],
          },
        ],
      }),
    ).toThrow(/subtitle_icon/)
  })

  it('resolves semantic subtitle_color tokens', () => {
    const config = parseLandingPostsConfig({
      ...minimal,
      posts: [
        {
          id: 'a',
          title: 'Post A',
          slides: [
            {
              type: 'image',
              src: '/landing/a.png',
              subtitle: 'Sub',
              subtitle_color: 'error',
              content: 'Body',
            },
          ],
        },
      ],
    })
    expect(config.posts[0].slides[0].subtitle_color).toBe('var(--error)')
  })

  it('rejects invalid source_url schemes', () => {
    expect(() =>
      parseLandingPostsConfig({
        ...minimal,
        posts: [
          {
            id: 'a',
            title: 'Post A',
            slides: [
              {
                type: 'image',
                src: '/landing/a.png',
                source_url: 'ftp://example.com',
                subtitle: 'Sub',
                content: 'Body',
              },
            ],
          },
        ],
      }),
    ).toThrow(/source_url must start with/)
  })

  it('rejects invalid subtitle_color values', () => {
    expect(() =>
      parseLandingPostsConfig({
        ...minimal,
        posts: [
          {
            id: 'a',
            title: 'Post A',
            slides: [
              {
                type: 'image',
                src: '/landing/a.png',
                subtitle: 'Sub',
                subtitle_color: 'not-a-color',
                content: 'Body',
              },
            ],
          },
        ],
      }),
    ).toThrow(/subtitle_color/)
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

  it('defaults hero intro from mission summary when hero is omitted', () => {
    const config = parseLandingPostsConfig({ ...minimal, hero: undefined })
    expect(config.hero.intro).toBe('Summary')
  })

  it('rejects empty posts', () => {
    expect(() => parseLandingPostsConfig({ ...minimal, posts: [] })).toThrow()
  })
})

describe('resolveSubtitleIcon', () => {
  it('accepts remix icon class names', () => {
    expect(resolveSubtitleIcon('ri-file-text-line')).toBe('ri-file-text-line')
    expect(resolveSubtitleIcon(' ri-error-warning-line ')).toBe('ri-error-warning-line')
  })

  it('rejects non-remix icon classes', () => {
    expect(() => resolveSubtitleIcon('fa-warning')).toThrow(/subtitle_icon/)
  })
})

describe('resolveSubtitleColor', () => {
  it('maps semantic tokens to CSS variables', () => {
    expect(resolveSubtitleColor('warn')).toBe('var(--warn)')
    expect(resolveSubtitleColor('accent')).toBe('var(--accent)')
  })

  it('passes through var() and hex colors', () => {
    expect(resolveSubtitleColor('var(--custom)')).toBe('var(--custom)')
    expect(resolveSubtitleColor('#f25f5c')).toBe('#f25f5c')
  })
})

describe('source url helpers', () => {
  it('classifies internal and external urls', () => {
    expect(isInternalSourceUrl('/hooks')).toBe(true)
    expect(isInternalSourceUrl('//cdn.example.com')).toBe(false)
    expect(isExternalSourceUrl('https://eur-lex.europa.eu/example')).toBe(true)
    expect(isExternalSourceUrl('/hooks')).toBe(false)
  })
})