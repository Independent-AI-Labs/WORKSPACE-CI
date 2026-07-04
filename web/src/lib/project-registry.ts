import { cache } from 'react'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { ProjectEntry, ProjectSummary, ProjectReadme } from '@/types/projects'

const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? join(process.cwd(), '..', '..')

export const PROJECTS: ProjectEntry[] = [
  {
    slug: 'workspace-ci',
    displayName: 'WORKSPACE-CI',
    language: 'Python',
    repoName: 'CI',
    icon: 'ri-terminal-box-line',
    readmePath: join(PROJECTS_ROOT, 'CI', 'README.md'),
  },
  {
    slug: 'workspace-guard',
    displayName: 'WORKSPACE-GUARD',
    language: 'Rust',
    repoName: 'WORKSPACE-GUARD',
    icon: 'ri-shield-keyhole-line',
    readmePath: join(PROJECTS_ROOT, 'WORKSPACE-GUARD', 'README.md'),
  },
]

export function getProjectBySlug(slug: string): ProjectEntry | undefined {
  return PROJECTS.find((p) => p.slug === slug)
}

export function getProjectSlugs(): string[] {
  return PROJECTS.map((p) => p.slug)
}

export function extractReadmeTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  const firstLine = markdown.trim().split('\n')[0]
  return firstLine.replace(/^#+\s*/, '').trim() || 'Untitled'
}

export function extractReadmeSummary(markdown: string): string {
  const lines = markdown.split('\n')
  let inCodeBlock = false
  const summaryParts: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    if (trimmed.startsWith('#')) continue
    if (trimmed.startsWith('<')) continue
    if (trimmed.startsWith('![')) continue
    if (trimmed === '' && summaryParts.length === 0) continue
    if (trimmed === '') break

    summaryParts.push(trimmed)
    if (summaryParts.join(' ').length > 500) break
  }

  let summary = summaryParts.join(' ').trim()
  if (summary.length > 600) {
    const lastPeriod = summary.lastIndexOf('. ', 597)
    summary = lastPeriod > 200 ? summary.slice(0, lastPeriod + 1) : summary.slice(0, 597) + '...'
  }
  return summary
}

export const loadProjectReadme = cache(
  async (slug: string): Promise<ProjectReadme | null> => {
    const entry = getProjectBySlug(slug)
    if (!entry) return null

    let content: string
    try {
      content = await readFile(entry.readmePath, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      return null
    }

    return {
      slug: entry.slug,
      displayName: entry.displayName,
      language: entry.language,
      repoName: entry.repoName,
      icon: entry.icon,
      title: extractReadmeTitle(content),
      content,
    }
  },
)

export const loadAllProjectSummaries = cache(
  async (): Promise<ProjectSummary[]> => {
    const results = await Promise.all(
      PROJECTS.map(async (entry) => {
        let content = ''
        try {
          content = await readFile(entry.readmePath, 'utf8')
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
          return null
        }
        return {
          slug: entry.slug,
          displayName: entry.displayName,
          language: entry.language,
          repoName: entry.repoName,
          icon: entry.icon,
          title: extractReadmeTitle(content),
          summary: extractReadmeSummary(content),
        }
      }),
    )
    return results.filter((r): r is ProjectSummary => r !== null)
  },
)