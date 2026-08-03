import { RotatingPosts } from '@/components/wiki/RotatingPosts'
import { getLandingPostsConfig } from '@/lib/landing-posts'

export function HomeLanding() {
  const config = getLandingPostsConfig()

  return (
    <div className="landing-page">
      <RotatingPosts posts={config.posts} settings={config.settings} ui={config.ui} />
    </div>
  )
}
