'use client'

import type { LandingPost, LandingSettings, LandingUi } from '@/lib/landing-posts'
import { useRotatingPostsController } from '@/hooks/useRotatingPostsController'
import { LandingStageCarousel } from '@/components/wiki/LandingStageCarousel'
import { LandingStageStacked } from '@/components/wiki/LandingStageStacked'
import { LandingStageVariant } from '@/components/wiki/LandingStageVariant'

interface RotatingPostsProps {
  posts: LandingPost[]
  settings: LandingSettings
  ui: LandingUi
}

export function RotatingPosts({ posts, settings, ui }: RotatingPostsProps) {
  const controller = useRotatingPostsController(posts, settings)

  return (
    <>
      <LandingStageVariant mode="stacked">
        <LandingStageStacked posts={posts} settings={settings} ui={ui} controller={controller} />
      </LandingStageVariant>
      <LandingStageVariant mode="carousel">
        <LandingStageCarousel posts={posts} settings={settings} ui={ui} controller={controller} />
      </LandingStageVariant>
    </>
  )
}