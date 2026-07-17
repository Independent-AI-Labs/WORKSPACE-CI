import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import { HeroBanner } from '@/components/wiki/HeroBanner'
import { getLandingPostsConfig } from '@/lib/landing-posts'

export function HomeLanding() {
  const config = getLandingPostsConfig()

  return (
    <div className="landing-page">
      <HeroBanner
        title={config.mission.headline}
        subtitle={config.mission.summary}
        dynamic
      />

      <RotatingPosts posts={config.posts} settings={config.settings} ui={config.ui} />
    </div>
  )
}
