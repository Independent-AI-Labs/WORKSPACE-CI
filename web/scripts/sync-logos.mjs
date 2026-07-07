import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

process.on('uncaughtException', (err) => {
  console.error('[sync-logos] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[sync-logos] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? path.resolve(WEB_DIR, '..', '..')

const REPOS = [
  { slug: 'workspace-ci', repoName: 'CI' },
  { slug: 'workspace-gateway', repoName: 'WORKSPACE-GATEWAY' },
  { slug: 'workspace-guard', repoName: 'WORKSPACE-GUARD' },
]

const DEST_DIR = path.resolve(WEB_DIR, 'public', 'logos')

// Local branding logos (themed variants) copied from this repo's res/ dir
// into public/ so branding.yaml paths resolve. Named explicitly so a stale
// file in public/ never survives a sync.
const LOCAL_LOGOS = [
  { src: 'res/LOGO.png', dest: 'public/LOGO.png' },
  { src: 'res/LOGO_DARK_THEME.png', dest: 'public/LOGO_DARK_THEME.png' },
  { src: 'res/LOGO_LIGHT_THEME.png', dest: 'public/LOGO_LIGHT_THEME.png' },
]

async function syncLogos() {
  await fs.mkdir(DEST_DIR, { recursive: true })

  // Per-repo project logos -> public/logos/<slug>.png
  const results = await Promise.all(
    REPOS.map(async ({ slug, repoName }) => {
      const src = path.resolve(PROJECTS_ROOT, repoName, 'res', 'LOGO.png')
      if (!existsSync(src)) {
        return { slug, ok: false, reason: `missing source: ${src}` }
      }
      const dest = path.resolve(DEST_DIR, `${slug}.png`)
      await fs.copyFile(src, dest)
      return { slug, ok: true, dest }
    }),
  )
  for (const r of results) {
    if (r.ok) {
      console.log(`[sync-logos] ${r.slug}: copied -> ${path.relative(WEB_DIR, r.dest)}`)
    } else {
      console.warn(`[sync-logos] ${r.slug}: ${r.reason}`)
    }
  }
  const failures = results.filter((r) => !r.ok)
  if (failures.length > 0) {
    console.warn(`[sync-logos] ${failures.length} repo(s) had no logo; wiki will fall back to icons.`)
  }

  // Local branding logos (themed variants) -> public/
  for (const { src, dest } of LOCAL_LOGOS) {
    const srcAbs = path.resolve(WEB_DIR, src)
    const destAbs = path.resolve(WEB_DIR, dest)
    if (!existsSync(srcAbs)) {
      console.warn(`[sync-logos] local logo missing: ${src}`)
      continue
    }
    await fs.copyFile(srcAbs, destAbs)
    console.log(`[sync-logos] local: ${src} -> ${path.relative(WEB_DIR, destAbs)}`)
  }
}

await syncLogos()