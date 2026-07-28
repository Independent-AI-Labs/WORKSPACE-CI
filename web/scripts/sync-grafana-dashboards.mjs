import fs from 'fs/promises'
import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'

process.on('uncaughtException', (err) => {
  console.error('[sync-grafana-dashboards] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[sync-grafana-dashboards] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT ?? path.resolve(WEB_DIR, '..', '..')
const REGISTRY_PATH = path.resolve(WEB_DIR, 'src', 'data', 'projects-registry.json')
const OUT_PATH = path.resolve(WEB_DIR, 'src', 'data', 'grafana-dashboards.json')
const CHECK_ONLY = process.argv.includes('--check')

const DEFAULT_QUERY =
  'orgId=1&from=now-30d&to=now&timezone=browser&var-model=$__all&var-api_key=$__all&refresh=5s'

function abort(message) {
  console.error(message)
  process.exit(1)
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveRepoDir(project) {
  if (project.slug === 'workspace-vm') {
    return process.env.WORKSPACE_PROJECTS_ROOT
      ? path.resolve(PROJECTS_ROOT, 'WORKSPACE-VM')
      : path.resolve(PROJECTS_ROOT, '..')
  }
  return path.resolve(PROJECTS_ROOT, project.repoName)
}

export function collectDashboards() {
  if (!existsSync(REGISTRY_PATH)) {
    console.warn(
      '[sync-grafana-dashboards] no projects registry; run sync-project-registry.mjs first'
    )
    return []
  }
  const projects = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')).projects ?? []
  const dashboards = []
  for (const project of projects) {
    if (!project.grafanaDashboards) continue
    const dir = path.join(resolveRepoDir(project), project.grafanaDashboards)
    if (!existsSync(dir)) {
      abort(`[sync-grafana-dashboards] ${project.slug}: dashboards dir missing: ${dir}`)
    }
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      const definition = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
      if (!definition.uid || !definition.title) {
        abort(`[sync-grafana-dashboards] ${file}: missing uid or title`)
      }
      dashboards.push({
        title: definition.title,
        path: `/d/${definition.uid}/${slugify(definition.title)}`,
        query: DEFAULT_QUERY,
        source: `${project.repoName}/${project.grafanaDashboards}/${file}`,
      })
    }
  }
  return dashboards
}

function render(dashboards) {
  return JSON.stringify({ version: 1, dashboards }, null, 2) + '\n'
}

async function main() {
  const dashboards = collectDashboards()
  const output = render(dashboards)
  if (CHECK_ONLY) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : ''
    if (current !== output) {
      abort(
        `[sync-grafana-dashboards] ${OUT_PATH} is stale; run: node scripts/sync-grafana-dashboards.mjs`
      )
    }
    console.log('[sync-grafana-dashboards] dashboards are up to date')
    return
  }
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(OUT_PATH, output)
  console.log(
    `[sync-grafana-dashboards] wrote ${dashboards.length} dashboards -> ${path.relative(WEB_DIR, OUT_PATH)}`
  )
  for (const d of dashboards) {
    console.log(`[sync-grafana-dashboards]   ${d.title} (${d.path})`)
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  await main()
}
