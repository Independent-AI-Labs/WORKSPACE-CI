import { redirect } from 'next/navigation'
import { WikiShell } from '@/components/wiki/WikiShell'
import { HomeLanding } from '@/components/wiki/HomeLanding'
import { isHomeLandingEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!isHomeLandingEnabled()) {
    redirect('/open-source')
  }

  return (
    <WikiShell contentClassName="wiki-content--landing">
      <HomeLanding />
    </WikiShell>
  )
}