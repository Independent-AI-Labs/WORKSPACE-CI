import fs from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { load } from 'js-yaml'
import { resolveConfigPath } from './config-paths.mjs'

process.on('uncaughtException', (err) => {
  console.error('[sync-logos] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[sync-logos] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT ?? path.resolve(WEB_DIR, '..', '..')
const DEST_DIR = path.resolve(WEB_DIR, 'public', 'logos')

function abort(message) {
  console.error(message)
  process.exit(1)
}

// Local branding logos (themed variants) copied from this repo's res/ dir
// into public/ so branding.yaml paths resolve. Derived from branding.yaml so
// a stale file in public/ never survives a sync.
function loadLocalLogos() {
  const branding = load(readFileSync(path.resolve(WEB_DIR, 'branding.yaml'), 'utf8'))
  const keys = ['logo_path', 'logo_path_dark', 'logo_path_light']
  return keys
    .map((key) => branding[key])
    .filter((p) => typeof p === 'string' && p.startsWith('/'))
    .map((publicPath) => ({
      src: path.join('res', path.basename(publicPath)),
      dest: path.join('public', publicPath),
    }))
}

function loadProjects() {
  const generatedPath = path.resolve(WEB_DIR, 'src', 'data', 'projects-registry.json')
  if (existsSync(generatedPath)) {
    return JSON.parse(readFileSync(generatedPath, 'utf8')).projects ?? []
  }
  const raw = readFileSync(resolveConfigPath('projects'), 'utf8')
  const config = load(raw)
  return config.projects ?? []
}

function resolveRepoDir(slug, repoName) {
  if (slug === 'workspace-vm') {
    if (process.env.WORKSPACE_PROJECTS_ROOT) {
      return path.resolve(PROJECTS_ROOT, 'WORKSPACE-VM')
    }
    return path.resolve(PROJECTS_ROOT, '..')
  }
  return path.resolve(PROJECTS_ROOT, repoName)
}

function resolveLogoSource(project) {
  const logo = project.logo ?? path.join('res', 'LOGO.png')
  return path.join(resolveRepoDir(project.slug, project.repoName), logo)
}

async function syncLogos() {
  await fs.mkdir(DEST_DIR, { recursive: true })

  const projects = loadProjects()

  // Per-repo project logos -> public/logos/<slug>.png
  const results = await Promise.all(
    projects
      .filter((p) => p.logoPath)
      .map(async (project) => {
        const { slug } = project
        const src = resolveLogoSource(project)
        if (!existsSync(src)) {
          return { slug, ok: false, reason: `missing source: ${src}` }
        }
        const dest = path.resolve(DEST_DIR, `${slug}.png`)
        await fs.copyFile(src, dest)
        return { slug, ok: true, dest }
      })
  )
  for (const r of results) {
    if (r.ok) {
      console.log(`[sync-logos] ${r.slug}: copied -> ${path.relative(WEB_DIR, r.dest)}`)
    } else {
      abort(`[sync-logos] ${r.slug}: ${r.reason}`)
    }
  }

  // Local branding logos (themed variants) -> public/
  for (const { src, dest } of loadLocalLogos()) {
    const srcAbs = path.resolve(WEB_DIR, src)
    const destAbs = path.resolve(WEB_DIR, dest)
    if (!existsSync(srcAbs)) {
      abort(`[sync-logos] local logo missing: ${src}`)
    }
    await fs.copyFile(srcAbs, destAbs)
    console.log(`[sync-logos] local: ${src} -> ${path.relative(WEB_DIR, destAbs)}`)
  }
}

await syncLogos()
