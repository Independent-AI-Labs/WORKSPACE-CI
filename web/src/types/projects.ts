export interface ProjectEntry {
  slug: string
  displayName: string
  language: string
  repoName: string
  icon: string
  logoPath?: string
  description?: string
  grafanaSubtitle?: string
  grafanaPort?: number
  startCommand?: string
  readmePath: string
  makefilePath: string
  repoUrl?: string
  branch: string
}

export interface ProjectSummary {
  slug: string
  displayName: string
  language: string
  repoName: string
  icon: string
  logoPath?: string
  description?: string
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
  logoPath?: string
  title: string
  content: string
  repoUrl?: string
  branch: string
}
