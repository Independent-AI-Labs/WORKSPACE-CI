import { WikiShell } from '@/components/wiki/WikiShell'
import { ContentRenderer } from '@/components/wiki/ContentRenderer'
import { loadProjectReadme, getProjectSlugs, getProjectBySlug } from '@/lib/project-registry'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  return getProjectSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const entry = getProjectBySlug(slug)
  if (!entry) return { title: 'Project not found' }
  return {
    title: entry.displayName,
    description: `${entry.displayName} README documentation`,
  }
}

export default async function ProjectReadmePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const project = await loadProjectReadme(slug)

  if (!project) notFound()

  return (
    <WikiShell>
      <div className="project-detail">
        <div className="project-detail__header">
          {project.logoPath ? (
            <img src={project.logoPath} className="project-detail__logo" alt="" width={32} height={32} />
          ) : (
            <i className={project.icon} aria-hidden="true" />
          )}
          <h1>{project.displayName}</h1>
          <span className="project-detail__badge">{project.language}</span>
        </div>
        <ContentRenderer content={project.content} />
      </div>
    </WikiShell>
  )
}