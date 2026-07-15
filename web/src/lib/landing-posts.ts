import { cache } from 'react'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'

export type SlideType = 'image' | 'iframe' | 'document'

export interface LandingSlide {
  type: SlideType
  src: string
  subtitle: string
  content: string
  source_url?: string
  source_label?: string
}

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
  carousel_aria_label: string
  slide_tab_aria_label_template: string
  prev_slide_aria_label: string
  next_slide_aria_label: string
  posts_tablist_aria_label: string
  post_tab_aria_label_template: string
}

export interface LandingSettings {
  post_interval_ms: number
  slide_interval_ms: number
  transition_ms: number
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
    result.source_url = s.source_url.trim()
  }
  if (typeof s.source_label === 'string' && s.source_label.trim()) {
    result.source_label = s.source_label.trim()
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
  }

  const heroRaw = data.hero
  if (!heroRaw || typeof heroRaw !== 'object') {
    throw new Error('landing-posts.yaml: hero is required')
  }
  const h = heroRaw as Record<string, unknown>

  const mission = data.mission
  if (!mission || typeof mission !== 'object') {
    throw new Error('landing-posts.yaml: mission is required')
  }
  const m = mission as Record<string, unknown>

  const settingsRaw = data.settings
  if (!settingsRaw || typeof settingsRaw !== 'object') {
    throw new Error('landing-posts.yaml: settings is required')
  }
  const s = settingsRaw as Record<string, unknown>
  const settings: LandingSettings = {
    post_interval_ms: requireNumber(s.post_interval_ms, 'settings.post_interval_ms'),
    slide_interval_ms: requireNumber(s.slide_interval_ms, 'settings.slide_interval_ms'),
    transition_ms: requireNumber(s.transition_ms, 'settings.transition_ms'),
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
      intro: requireString(h.intro, 'hero.intro'),
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

export const getLandingPostsConfig = cache((): LandingPostsConfig | null => {
  const yamlPath = resolveLandingYamlPath()
  if (!yamlPath) return null
  const raw = load(readFileSync(yamlPath, 'utf8'))
  return parseLandingPostsConfig(raw)
})