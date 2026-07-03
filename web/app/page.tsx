import { WikiShell } from '@/components/wiki/WikiShell'
import { ProjectCard } from '@/components/wiki/ProjectCard'
import { loadAllProjectSummaries } from '@/lib/project-registry'

export default async function HomePage() {
  const projects = await loadAllProjectSummaries()

  return (
    <WikiShell>
      <h1>Project Catalogue</h1>
      <p className="page-intro">
        Browse README documentation for all backend projects in the workspace.
        Click a project to read its full README.
      </p>
      <div className="project-grid">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </div>
    </WikiShell>
  )
}