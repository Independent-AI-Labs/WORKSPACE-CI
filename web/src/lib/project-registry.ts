import { cache } from 'react'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import type { ProjectEntry, ProjectSummary, ProjectReadme } from '@/types/projects'

const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? join(process.cwd(), '..', '..')

const CONFIG_ROOT = process.env.WORKSPACE_CI_CONFIG_ROOT
  ?? join(process.cwd(), '..', 'config')

const DEFAULT_BRANCH = 'main'

interface ProjectConfigEntry {
  slug: string
  displayName: string
  language: string
  repoName: string
  icon: string
  logoPath?: string
}

interface ProjectsConfig {
  version: number
  projects: ProjectConfigEntry[]
}

function loadProjectsConfig(): ProjectsConfig {
  const raw = readFileSync(join(CONFIG_ROOT, 'projects.yaml'), 'utf8')
  return load(raw) as ProjectsConfig
}

/** Umbrella repo (WORKSPACE-VM) lives above projects/ in dev; staged under WORKSPACE-VM/ in prod. */
export function resolveRepoDir(cfg: ProjectConfigEntry, projectsRoot = PROJECTS_ROOT): string {
  if (cfg.slug === 'workspace-vm') {
    if (process.env.WORKSPACE_PROJECTS_ROOT) {
      return join(projectsRoot, 'WORKSPACE-VM')
    }
    return join(projectsRoot, '..')
  }
  return join(projectsRoot, cfg.repoName)
}

function buildProjectEntry(cfg: ProjectConfigEntry): ProjectEntry {
  const repoDirPath = resolveRepoDir(cfg)
  return {
    slug: cfg.slug,
    displayName: cfg.displayName,
    language: cfg.language,
    repoName: cfg.repoName,
    icon: cfg.icon,
    ...(cfg.logoPath ? { logoPath: cfg.logoPath } : {}),
    readmePath: join(repoDirPath, 'README.md'),
    makefilePath: join(repoDirPath, 'Makefile'),
    repoUrl: getRepoUrl(repoDirPath) || undefined,
    branch: getDefaultBranch(repoDirPath),
  }
}

export const PROJECTS: ProjectEntry[] = loadProjectsConfig().projects.map(buildProjectEntry)

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