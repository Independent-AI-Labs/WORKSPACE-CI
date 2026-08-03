import { redirect } from 'next/navigation'
import { WikiShell } from '@/components/wiki/WikiShell'
import { HomeLanding } from '@/components/wiki/HomeLanding'
import { getLandingPostsConfig } from '@/lib/landing-posts'
import { isHomeLandingEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!isHomeLandingEnabled()) {
    redirect('/open-source')
  }

  const config = getLandingPostsConfig()

  return (
    <WikiShell
      contentClassName="wiki-content--landing"
      hero={{ title: config.mission.headline, subtitle: config.mission.summary, dynamic: true }}
    >
      <HomeLanding />
    </WikiShell>
  )
}