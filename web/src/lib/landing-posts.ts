import { cache } from 'react'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import {
  isExternalSourceUrl,
  isInternalSourceUrl,
  resolveSubtitleColor,
  type LandingSlide,
} from '@/lib/landing-slide'

export type {
  SlideType,
  LandingSourceUrl,
  LandingSlide,
} from '@/lib/landing-slide'

export {
  isInternalSourceUrl,
  isExternalSourceUrl,
  resolveSubtitleColor,
} from '@/lib/landing-slide'

export interface LandingPost {
  id: string
  title: string
  tab_label?: string
  slides: LandingSlide[]
}

export interface LandingHero {
  intro: string
}

export interface LandingMission {
  headline: string
  summary: string
}

export interface LandingUi {
  missing_content_message: string
  source_link_label: string
  download_link_label: string
  carousel_aria_label: string
  slide_tab_aria_label_template: string
  prev_slide_aria_label: string
  next_slide_aria_label: string
  posts_tablist_aria_label: string
  post_tab_aria_label_template: string
  post_tabs_scroll_prev_aria_label: string
  post_tabs_scroll_next_aria_label: string
}

export interface LandingSettings {
  post_interval_ms: number
  slide_interval_ms: number
  transition_ms: number
  text_transition_ms: number
  background_pan_duration_ms: number
}

export interface LandingPostsConfig {
  version: number
  ui: LandingUi
  hero: LandingHero
  mission: LandingMission
  settings: LandingSettings
  posts: LandingPost[]
}

const LANDING_YAML_CANDIDATES = [
  join(process.cwd(), 'content', 'landing-posts.yaml'),
  join(process.cwd(), '..', '..', 'WORKSPACE-WEB-CONTENT', 'landing-posts.yaml'),
]

function resolveLandingYamlPath(): string | null {
  const envRoot = process.env.WORKSPACE_WEB_CONTENT_ROOT
  if (envRoot) {
    const envPath = join(envRoot, 'landing-posts.yaml')
    if (existsSync(envPath)) return envPath
  }
  for (const candidate of LANDING_YAML_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`landing-posts.yaml: ${field} is required`)
  }
  return value
}

function optionalString(value: unknown, defaultValue: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  return defaultValue
}

function assertSlide(slide: unknown, postId: string, index: number): LandingSlide {
  if (!slide || typeof slide !== 'object') {
    throw new Error(`Post "${postId}" slide ${index}: expected object`)
  }
  const s = slide as Record<string, unknown>
  const type = s.type
  if (type !== 'image' && type !== 'iframe' && type !== 'document') {
    throw new Error(`Post "${postId}" slide ${index}: invalid type "${String(type)}"`)
  }
  const result: LandingSlide = {
    type,
    src: requireString(s.src, `posts.${postId}.slides[${index}].src`),
    subtitle: requireString(s.subtitle, `posts.${postId}.slides[${index}].subtitle`),
    content: requireString(s.content, `posts.${postId}.slides[${index}].content`),
  }
  if (typeof s.source_url === 'string' && s.source_url.trim()) {
    const sourceUrl = s.source_url.trim()
    if (!isInternalSourceUrl(sourceUrl) && !isExternalSourceUrl(sourceUrl)) {
      throw new Error(
        `Post "${postId}" slide ${index}: source_url must start with /, http://, or https://`,
      )
    }
    result.source_url = sourceUrl
  }
  if (typeof s.source_label === 'string' && s.source_label.trim()) {
    result.source_label = s.source_label.trim()
  }
  if (typeof s.download_label === 'string' && s.download_label.trim()) {
    result.download_label = s.download_label.trim()
  }
  if (typeof s.subtitle_color === 'string' && s.subtitle_color.trim()) {
    result.subtitle_color = resolveSubtitleColor(s.subtitle_color)
  }
  return result
}

export function parseLandingPostsConfig(raw: unknown): LandingPostsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('landing-posts.yaml: root must be an object')
  }
  const data = raw as Record<string, unknown>

  const uiRaw = data.ui
  if (!uiRaw || typeof uiRaw !== 'object') {
    throw new Error('landing-posts.yaml: ui is required')
  }
  const u = uiRaw as Record<string, unknown>
  const ui: LandingUi = {
    missing_content_message: requireString(u.missing_content_message, 'ui.missing_content_message'),
    source_link_label: requireString(u.source_link_label, 'ui.source_link_label'),
    download_link_label: requireString(u.download_link_label, 'ui.download_link_label'),
    carousel_aria_label: requireString(u.carousel_aria_label, 'ui.carousel_aria_label'),
    slide_tab_aria_label_template: requireString(
      u.slide_tab_aria_label_template,
      'ui.slide_tab_aria_label_template',
    ),
    prev_slide_aria_label: requireString(u.prev_slide_aria_label, 'ui.prev_slide_aria_label'),
    next_slide_aria_label: requireString(u.next_slide_aria_label, 'ui.next_slide_aria_label'),
    posts_tablist_aria_label: requireString(
      u.posts_tablist_aria_label,
      'ui.posts_tablist_aria_label',
    ),
    post_tab_aria_label_template: requireString(
      u.post_tab_aria_label_template,
      'ui.post_tab_aria_label_template',
    ),
    post_tabs_scroll_prev_aria_label: optionalString(
      u.post_tabs_scroll_prev_aria_label,
      'Scroll tabs left',
    ),
    post_tabs_scroll_next_aria_label: optionalString(
      u.post_tabs_scroll_next_aria_label,
      'Scroll tabs right',
    ),
  }

  const mission = data.mission
  if (!mission || typeof mission !== 'object') {
    throw new Error('landing-posts.yaml: mission is required')
  }
  const m = mission as Record<string, unknown>
  const missionSummary = requireString(m.summary, 'mission.summary')

  const heroRaw = data.hero
  const heroIntro =
    heroRaw && typeof heroRaw === 'object'
      ? requireString((heroRaw as Record<string, unknown>).intro, 'hero.intro')
      : missionSummary

  const settingsRaw = data.settings
  if (!settingsRaw || typeof settingsRaw !== 'object') {
    throw new Error('landing-posts.yaml: settings is required')
  }
  const s = settingsRaw as Record<string, unknown>
  const transitionMs = requireNumber(s.transition_ms, 'settings.transition_ms')
  const settings: LandingSettings = {
    post_interval_ms: requireNumber(s.post_interval_ms, 'settings.post_interval_ms'),
    slide_interval_ms: requireNumber(s.slide_interval_ms, 'settings.slide_interval_ms'),
    transition_ms: transitionMs,
    text_transition_ms:
      typeof s.text_transition_ms === 'number'
        ? s.text_transition_ms
        : Math.round(transitionMs * 0.4),
    background_pan_duration_ms: requireNumber(
      s.background_pan_duration_ms,
      'settings.background_pan_duration_ms',
    ),
  }

  const postsRaw = data.posts
  if (!Array.isArray(postsRaw) || postsRaw.length === 0) {
    throw new Error('landing-posts.yaml: posts must be a non-empty list')
  }
  const posts: LandingPost[] = postsRaw.map((post, pi) => {
    if (!post || typeof post !== 'object') {
      throw new Error(`landing-posts.yaml: posts[${pi}] must be an object`)
    }
    const p = post as Record<string, unknown>
    const id = requireString(p.id, `posts[${pi}].id`)
    const title = requireString(p.title, `posts[${pi}].title`)
    if (!Array.isArray(p.slides) || p.slides.length === 0) {
      throw new Error(`landing-posts.yaml: posts[${pi}] slides must be non-empty`)
    }
    const entry: LandingPost = {
      id,
      title,
      slides: p.slides.map((slide, si) => assertSlide(slide, id, si)),
    }
    if (typeof p.tab_label === 'string' && p.tab_label.trim()) {
      entry.tab_label = p.tab_label.trim()
    }
    return entry
  })

  return {
    version: typeof data.version === 'number' ? data.version : 1,
    ui,
    hero: {
      intro: heroIntro,
    },
    mission: {
      headline: requireString(m.headline, 'mission.headline'),
      summary: requireString(m.summary, 'mission.summary'),
    },
    settings,
    posts,
  }
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`landing-posts.yaml: ${field} must be a number`)
  }
  return value
}

export const getLandingPostsConfig = cache((): LandingPostsConfig => {
  const yamlPath = resolveLandingYamlPath()
  if (!yamlPath) {
    throw new Error(
      'landing-posts.yaml not found. Run node scripts/sync-web-content.mjs from CI/web ' +
        'with WORKSPACE-WEB-CONTENT checked out.',
    )
  }
  let raw: unknown
  try {
    raw = load(readFileSync(yamlPath, 'utf8'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`landing-posts.yaml (${yamlPath}): ${message}`)
  }
  return parseLandingPostsConfig(raw)
})