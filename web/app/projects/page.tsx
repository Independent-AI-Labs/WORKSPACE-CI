import { WikiShell } from '@/components/wiki/WikiShell'
import { ProjectCatalogue } from '@/components/wiki/ProjectCatalogue'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  return (
    <WikiShell>
      <ProjectCatalogue />
    </WikiShell>
  )
}