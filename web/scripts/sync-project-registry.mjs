import fs from 'fs/promises'
import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { load } from 'js-yaml'

process.on('uncaughtException', (err) => {
  console.error('[sync-project-registry] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[sync-project-registry] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT ?? path.resolve(WEB_DIR, '..', '..')
const OUT_PATH = path.resolve(WEB_DIR, 'src', 'data', 'projects-registry.json')
const CHECK_ONLY = process.argv.includes('--check')

const REQUIRED_FIELDS = ['slug', 'displayName', 'repoName', 'language', 'icon']

function abort(message) {
  console.error(message)
  process.exit(1)
}

function manifestCandidates() {
  const candidates = []
  const umbrellaDir = process.env.WORKSPACE_PROJECTS_ROOT
    ? path.resolve(PROJECTS_ROOT, 'WORKSPACE-VM')
    : path.resolve(PROJECTS_ROOT, '..')
  candidates.push(path.join(umbrellaDir, 'project.yaml'))
  if (!existsSync(PROJECTS_ROOT)) return candidates
  for (const entry of readdirSync(PROJECTS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    candidates.push(path.join(PROJECTS_ROOT, entry.name, 'project.yaml'))
  }
  return candidates
}

function loadManifest(manifestPath) {
  const raw = load(readFileSync(manifestPath, 'utf8'))
  const project = raw?.project
  if (!project || typeof project !== 'object') {
    abort(`[sync-project-registry] ${manifestPath}: missing 'project' mapping`)
  }
  for (const field of REQUIRED_FIELDS) {
    if (typeof project[field] !== 'string' || project[field] === '') {
      abort(`[sync-project-registry] ${manifestPath}: missing required field '${field}'`)
    }
  }
  return project
}

function toRegistryEntry(project, repoDir) {
  const entry = {
    slug: project.slug,
    displayName: project.displayName,
    language: project.language,
    repoName: project.repoName,
    icon: project.icon,
  }
  if (typeof project.logo === 'string' && project.logo !== '') {
    if (existsSync(path.join(repoDir, project.logo))) {
      entry.logo = project.logo
      entry.logoPath = `/logos/${project.slug}.png`
    } else {
      console.warn(
        `[sync-project-registry] ${project.slug}: logo not found: ${path.join(repoDir, project.logo)}`
      )
    }
  }
  if (typeof project.description === 'string' && project.description !== '') {
    entry.description = project.description.trim()
  }
  if (typeof project.grafanaDashboards === 'string' && project.grafanaDashboards !== '') {
    entry.grafanaDashboards = project.grafanaDashboards
  }
  if (typeof project.grafanaSubtitle === 'string' && project.grafanaSubtitle !== '') {
    entry.grafanaSubtitle = project.grafanaSubtitle.trim()
  }
  if (typeof project.startCommand === 'string' && project.startCommand !== '') {
    entry.startCommand = project.startCommand
  }
  if (typeof project.grafanaPort === 'number') {
    entry.grafanaPort = project.grafanaPort
  }
  return entry
}

export function collectProjects() {
  const bySlug = new Map()
  for (const manifestPath of manifestCandidates()) {
    if (!existsSync(manifestPath)) continue
    const project = loadManifest(manifestPath)
    const repoDir = path.dirname(manifestPath)
    const entry = toRegistryEntry(project, repoDir)
    const existing = bySlug.get(entry.slug)
    if (!existing || entry.repoName === entry.displayName) {
      bySlug.set(entry.slug, entry)
    }
  }
  return [...bySlug.values()]
}

function renderRegistry(projects) {
  return JSON.stringify({ version: 1, projects }, null, 2) + '\n'
}

export function loadRegistry(webDir = WEB_DIR) {
  const jsonPath = path.resolve(webDir, 'src', 'data', 'projects-registry.json')
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, 'utf8')).projects ?? []
  }
  return null
}

async function main() {
  const projects = collectProjects()
  if (projects.length === 0) {
    abort(`[sync-project-registry] no project.yaml manifests found under ${PROJECTS_ROOT}`)
  }
  if (!projects.some((p) => p.slug === 'workspace-ci')) {
    abort('[sync-project-registry] registry must contain the workspace-ci project')
  }
  const output = renderRegistry(projects)
  if (CHECK_ONLY) {
    if (!existsSync(OUT_PATH)) {
      abort(
        `[sync-project-registry] ${OUT_PATH} is missing; run: node scripts/sync-project-registry.mjs`
      )
    }
    const current = readFileSync(OUT_PATH, 'utf8')
    if (current !== output) {
      abort(
        `[sync-project-registry] ${OUT_PATH} is stale; run: node scripts/sync-project-registry.mjs`
      )
    }
    console.log('[sync-project-registry] registry is up to date')
    return
  }
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(OUT_PATH, output)
  console.log(
    `[sync-project-registry] wrote ${projects.length} projects -> ${path.relative(WEB_DIR, OUT_PATH)}`
  )
  for (const p of projects) {
    console.log(`[sync-project-registry]   ${p.slug} (${p.repoName})`)
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  await main()
}
