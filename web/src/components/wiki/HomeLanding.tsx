import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import { getLandingPostsConfig } from '@/lib/landing-posts'

export function HomeLanding() {
  const config = getLandingPostsConfig()
  if (!config) {
    return null
  }

  return (
    <div className="landing-page">
      <header className="landing-mission">
        <h1 className="landing-mission__headline">{config.mission.headline}</h1>
        <p className="landing-mission__summary">{config.mission.summary}</p>
      </header>

      <RotatingPosts
        posts={config.posts}
        settings={config.settings}
        ui={config.ui}
      />
    </div>
  )
}