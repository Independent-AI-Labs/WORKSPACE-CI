import Link from 'next/link'
import type { ProjectSummary } from '@/types/projects'

interface ProjectCardProps {
  project: ProjectSummary
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      href={`/${project.slug}`}
      className="project-card"
      aria-label={`Read README for ${project.displayName}`}
    >
      <div className="project-card__header">
        <i className={project.icon} aria-hidden="true" />
        <span className="project-card__name">{project.displayName}</span>
        <span className="project-card__badge">{project.language}</span>
      </div>
      <p className="project-card__title">{project.title}</p>
      <p className="project-card__summary">{project.summary}</p>
      <span className="project-card__link">Read README</span>
    </Link>
  )
}