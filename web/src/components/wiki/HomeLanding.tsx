import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import { getBranding } from '@/lib/branding'
import { getLandingPostsConfig } from '@/lib/landing-posts'

export function HomeLanding() {
  const config = getLandingPostsConfig()
  if (!config) {
    return null
  }

  const branding = getBranding()

  return (
    <div className="landing-page">
      <section className="hero landing-hero">
        <h1 className="hero__title">{branding.name}</h1>
        <p className="hero__subtitle">{config.hero.intro}</p>
      </section>

      <RotatingPosts
        posts={config.posts}
        settings={config.settings}
        ui={config.ui}
      />
    </div>
  )
}