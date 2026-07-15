import { marked } from 'marked'
import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import { getBranding } from '@/lib/branding'
import { getLandingPostsConfig } from '@/lib/landing-posts'
import { sanitizeHtml } from '@/lib/sanitize'

function renderHeroIntro(text: string): string {
  return sanitizeHtml(marked.parseInline(text, { gfm: true }) as string)
}

export function HomeLanding() {
  const config = getLandingPostsConfig()
  const branding = getBranding()

  return (
    <div className="landing-page">
      <section className="hero landing-hero">
        <h1 className="hero__title">{branding.name}</h1>
        <p
          className="hero__subtitle"
          dangerouslySetInnerHTML={{ __html: renderHeroIntro(config.hero.intro) }}
        />
      </section>

      <RotatingPosts
        posts={config.posts}
        settings={config.settings}
        ui={config.ui}
      />
    </div>
  )
}