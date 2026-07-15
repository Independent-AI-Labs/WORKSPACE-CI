import { WikiShell } from '@/components/wiki/WikiShell'
import { HomeLanding } from '@/components/wiki/HomeLanding'
import { ProjectCatalogue } from '@/components/wiki/ProjectCatalogue'
import { isHomeLandingEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const landingEnabled = isHomeLandingEnabled()

  return (
    <WikiShell contentClassName={landingEnabled ? 'wiki-content--landing' : undefined}>
      {landingEnabled ? <HomeLanding /> : <ProjectCatalogue />}
    </WikiShell>
  )
}