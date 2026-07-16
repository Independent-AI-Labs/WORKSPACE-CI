import { marked } from 'marked'
import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import { getLandingPostsConfig } from '@/lib/landing-posts'
import { sanitizeHtml } from '@/lib/sanitize'

function renderLandingMarkdown(text: string): string {
  return sanitizeHtml(marked.parseInline(text, { gfm: true }) as string)
}

export function HomeLanding() {
  const config = getLandingPostsConfig()

  return (
    <div className="landing-page">
      <section className="hero landing-hero">
        <h1 className="hero__title">{config.mission.headline}</h1>
        <p
          className="hero__subtitle"
          dangerouslySetInnerHTML={{
            __html: renderLandingMarkdown(config.mission.summary),
          }}
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