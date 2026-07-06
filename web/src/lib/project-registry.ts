import { cache } from 'react'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectEntry, ProjectSummary, ProjectReadme } from '@/types/projects'

const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? join(process.cwd(), '..', '..')

function getGitHubBaseUrl(): string {
  const gitConfigPath = join(process.cwd(), '..', '.git', 'config')
  let config: string
  try {
    config = readFileSync(gitConfigPath, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return ''
  }
  const sectionMatch = config.match(/\[remote "origin"\][^\[]*?url\s*=\s*(\S+)/)
  if (!sectionMatch) return ''
  const remote = sectionMatch[1]
  const sshMatch = remote.match(/git@([^:]+):([^/]+)\//)
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`
  const httpsMatch = remote.match(/https?:\/\/([^/]+\/[^/]+)\//)
  if (httpsMatch) return `https://${httpsMatch[1]}`
  return ''
}

const GITHUB_BASE_URL = getGitHubBaseUrl()

export const PROJECTS: ProjectEntry[] = [
  {
    slug: 'workspace-ci',
    displayName: 'WORKSPACE-CI',
    language: 'Python',
    repoName: 'CI',
    icon: 'ri-terminal-box-line',
    logoPath: '/LOGO.png',
    readmePath: join(PROJECTS_ROOT, 'CI', 'README.md'),
    makefilePath: join(PROJECTS_ROOT, 'CI', 'Makefile'),
  },
  {
    slug: 'workspace-gateway',
    displayName: 'WORKSPACE-GATEWAY',
    language: 'Lua',
    repoName: 'WORKSPACE-GATEWAY',
    icon: 'ri-router-line',
    readmePath: join(PROJECTS_ROOT, 'WORKSPACE-GATEWAY', 'README.md'),
    makefilePath: join(PROJECTS_ROOT, 'WORKSPACE-GATEWAY', 'Makefile'),
  },
  {
    slug: 'workspace-guard',
    displayName: 'WORKSPACE-GUARD',
    language: 'Rust',
    repoName: 'WORKSPACE-GUARD',
    icon: 'ri-shield-keyhole-line',
    logoPath: '/GUARD_LOGO.png',
    readmePath: join(PROJECTS_ROOT, 'WORKSPACE-GUARD', 'README.md'),
    makefilePath: join(PROJECTS_ROOT, 'WORKSPACE-GUARD', 'Makefile'),
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
  }

  const full = summaryParts.join(' ').trim()
  const sentences = full.split(/(?<=\.)\s+(?=[A-Z])/)
  return sentences.slice(0, 3).join(' ').trim()
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
      ...(entry.logoPath ? { logoPath: entry.logoPath } : {}),
      title: extractReadmeTitle(content),
      content,
    }
  },
)

export const loadProjectMakefile = cache(
  async (slug: string): Promise<string | null> => {
    const entry = getProjectBySlug(slug)
    if (!entry) return null
    try {
      return await readFile(entry.makefilePath, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      return null
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
          ...(entry.logoPath ? { logoPath: entry.logoPath } : {}),
          title: extractReadmeTitle(content),
          summary: extractReadmeSummary(content),
          ...(GITHUB_BASE_URL
            ? { repoUrl: `${GITHUB_BASE_URL}/${entry.displayName}` }
            : {}),
        }
      }),
    )
    return results.filter((r): r is ProjectSummary => r !== null)
  },
)