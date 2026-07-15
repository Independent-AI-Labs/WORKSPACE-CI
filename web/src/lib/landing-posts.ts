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
}

export interface LandingPost {
  id: string
  title: string
  slides: LandingSlide[]
}

export interface LandingProduct {
  slug: string
  blurb: string
}

export interface LandingMission {
  headline: string
  summary: string
  products: LandingProduct[]
}

export interface LandingSettings {
  post_interval_ms: number
  slide_interval_ms: number
  transition_ms: number
}

export interface LandingPostsConfig {
  version: number
  mission: LandingMission
  settings: LandingSettings
  posts: LandingPost[]
}

const DEFAULT_SETTINGS: LandingSettings = {
  post_interval_ms: 30000,
  slide_interval_ms: 7000,
  transition_ms: 1200,
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

function assertSlide(slide: unknown, postId: string, index: number): LandingSlide {
  if (!slide || typeof slide !== 'object') {
    throw new Error(`Post "${postId}" slide ${index}: expected object`)
  }
  const s = slide as Record<string, unknown>
  const type = s.type
  if (type !== 'image' && type !== 'iframe' && type !== 'document') {
    throw new Error(`Post "${postId}" slide ${index}: invalid type "${String(type)}"`)
  }
  if (typeof s.src !== 'string' || !s.src.trim()) {
    throw new Error(`Post "${postId}" slide ${index}: src is required`)
  }
  if (typeof s.subtitle !== 'string') {
    throw new Error(`Post "${postId}" slide ${index}: subtitle is required`)
  }
  if (typeof s.content !== 'string') {
    throw new Error(`Post "${postId}" slide ${index}: content is required`)
  }
  const result: LandingSlide = {
    type,
    src: s.src.trim(),
    subtitle: s.subtitle,
    content: s.content,
  }
  if (typeof s.source_url === 'string' && s.source_url.trim()) {
    result.source_url = s.source_url.trim()
  }
  return result
}

export function parseLandingPostsConfig(raw: unknown): LandingPostsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('landing-posts.yaml: root must be an object')
  }
  const data = raw as Record<string, unknown>
  const mission = data.mission
  if (!mission || typeof mission !== 'object') {
    throw new Error('landing-posts.yaml: mission is required')
  }
  const m = mission as Record<string, unknown>
  if (typeof m.headline !== 'string' || typeof m.summary !== 'string') {
    throw new Error('landing-posts.yaml: mission.headline and mission.summary are required')
  }
  const productsRaw = m.products
  if (!Array.isArray(productsRaw)) {
    throw new Error('landing-posts.yaml: mission.products must be a list')
  }
  const products: LandingProduct[] = productsRaw.map((p, i) => {
    if (!p || typeof p !== 'object') {
      throw new Error(`landing-posts.yaml: mission.products[${i}] must be an object`)
    }
    const entry = p as Record<string, unknown>
    if (typeof entry.slug !== 'string' || typeof entry.blurb !== 'string') {
      throw new Error(`landing-posts.yaml: mission.products[${i}] needs slug and blurb`)
    }
    return { slug: entry.slug, blurb: entry.blurb }
  })

  const settingsRaw = data.settings
  let settings = DEFAULT_SETTINGS
  if (settingsRaw && typeof settingsRaw === 'object') {
    const s = settingsRaw as Record<string, unknown>
    settings = {
      post_interval_ms:
        typeof s.post_interval_ms === 'number' ? s.post_interval_ms : DEFAULT_SETTINGS.post_interval_ms,
      slide_interval_ms:
        typeof s.slide_interval_ms === 'number'
          ? s.slide_interval_ms
          : DEFAULT_SETTINGS.slide_interval_ms,
      transition_ms:
        typeof s.transition_ms === 'number' ? s.transition_ms : DEFAULT_SETTINGS.transition_ms,
    }
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
    if (typeof p.id !== 'string' || typeof p.title !== 'string') {
      throw new Error(`landing-posts.yaml: posts[${pi}] needs id and title`)
    }
    if (!Array.isArray(p.slides) || p.slides.length === 0) {
      throw new Error(`landing-posts.yaml: posts[${pi}] slides must be non-empty`)
    }
    return {
      id: p.id,
      title: p.title,
      slides: p.slides.map((slide, si) => assertSlide(slide, p.id as string, si)),
    }
  })

  return {
    version: typeof data.version === 'number' ? data.version : 1,
    mission: {
      headline: m.headline,
      summary: m.summary,
      products,
    },
    settings,
    posts,
  }
}

export const getLandingPostsConfig = cache((): LandingPostsConfig | null => {
  const yamlPath = resolveLandingYamlPath()
  if (!yamlPath) return null
  const raw = load(readFileSync(yamlPath, 'utf8'))
  return parseLandingPostsConfig(raw)
})