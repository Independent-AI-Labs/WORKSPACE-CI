import { cache } from 'react'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectEntry, ProjectSummary, ProjectReadme } from '@/types/projects'

const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? join(process.cwd(), '..', '..')

const DEFAULT_BRANCH = 'main'

function readGitFile(repoDir: string, relativePath: string): string | null {
  try {
    return readFileSync(join(repoDir, '.git', relativePath), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return null
  }
}

function parseRepoUrl(config: string): string {
  const sectionMatch = config.match(/\[remote "origin"\][^\[]*?url\s*=\s*(\S+)/)
  if (!sectionMatch) return ''
  const remote = sectionMatch[1]
  const sshMatch = remote.match(/git@([^:]+):([^/]+\/[^/]+?)(?:\.git)?$/)
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`
  const httpsMatch = remote.match(/https?:\/\/([^/]+\/[^/]+?)(?:\.git)?$/)
  if (httpsMatch) return `https://${httpsMatch[1]}`
  return ''
}

export function getRepoUrl(repoDir: string): string {
  const config = readGitFile(repoDir, 'config')
  return config ? parseRepoUrl(config) : ''
}

export function getDefaultBranch(repoDir: string): string {
  const head = readGitFile(repoDir, 'HEAD')
  if (head) {
    const match = head.trim().match(/^ref:\s*refs\/heads\/(.+)$/)
    if (match) return match[1]
  }
  return DEFAULT_BRANCH
}

function repoDir(repoName: string): string {
  return join(PROJECTS_ROOT, repoName)
}

export const PROJECTS: ProjectEntry[] = [
  {
    slug: 'workspace-ci',
    displayName: 'WORKSPACE-CI',
    language: 'Python',
    repoName: 'CI',
    icon: 'ri-terminal-box-line',
    logoPath: '/logos/workspace-ci.png',
    readmePath: join(PROJECTS_ROOT, 'CI', 'README.md'),
    makefilePath: join(PROJECTS_ROOT, 'CI', 'Makefile'),
    repoUrl: getRepoUrl(repoDir('CI')) || undefined,
    branch: getDefaultBranch(repoDir('CI')),
  },
  {
    slug: 'workspace-gateway',
    displayName: 'WORKSPACE-GATEWAY',
    language: 'Lua',
    repoName: 'WORKSPACE-GATEWAY',
    icon: 'ri-router-line',
    logoPath: '/logos/workspace-gateway.png',
    readmePath: join(PROJECTS_ROOT, 'WORKSPACE-GATEWAY', 'README.md'),
    makefilePath: join(PROJECTS_ROOT, 'WORKSPACE-GATEWAY', 'Makefile'),
    repoUrl: getRepoUrl(repoDir('WORKSPACE-GATEWAY')) || undefined,
    branch: getDefaultBranch(repoDir('WORKSPACE-GATEWAY')),
  },
  {
    slug: 'workspace-guard',
    displayName: 'WORKSPACE-GUARD',
    language: 'Rust',
    repoName: 'WORKSPACE-GUARD',
    icon: 'ri-shield-keyhole-line',
    logoPath: '/logos/workspace-guard.png',
    readmePath: join(PROJECTS_ROOT, 'WORKSPACE-GUARD', 'README.md'),
    makefilePath: join(PROJECTS_ROOT, 'WORKSPACE-GUARD', 'Makefile'),
    repoUrl: getRepoUrl(repoDir('WORKSPACE-GUARD')) || undefined,
    branch: getDefaultBranch(repoDir('WORKSPACE-GUARD')),
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
      ...(entry.repoUrl ? { repoUrl: entry.repoUrl } : {}),
      branch: entry.branch,
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
          ...(entry.repoUrl ? { repoUrl: entry.repoUrl } : {}),
        }
      }),
    )
    return results.filter((r): r is ProjectSummary => r !== null)
  },
)