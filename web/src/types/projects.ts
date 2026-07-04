export interface ProjectEntry {
  slug: string
  displayName: string
  language: string
  repoName: string
  icon: string
  readmePath: string
}

export interface ProjectSummary {
  slug: string
  displayName: string
  language: string
  repoName: string
  icon: string
  title: string
  summary: string
  repoUrl?: string
}

export interface ProjectReadme {
  slug: string
  displayName: string
  language: string
  repoName: string
  icon: string
  title: string
  content: string
}