import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

process.on('uncaughtException', (err) => {
  console.error('[stage-umbrella-repo] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[stage-umbrella-repo] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? path.resolve(WEB_DIR, '..', '..')
const UMBRELLA_ROOT = path.resolve(PROJECTS_ROOT, '..')
const STAGE_DIR = path.resolve(PROJECTS_ROOT, 'WORKSPACE-VM')

const FILES = [
  { src: 'README.md', dest: 'README.md' },
  { src: 'Makefile', dest: 'Makefile' },
  { src: path.join('.git', 'config'), dest: path.join('.git', 'config') },
  { src: path.join('res', 'LOGO.png'), dest: path.join('res', 'LOGO.png') },
]

async function copyFile(srcAbs, destAbs) {
  await fs.mkdir(path.dirname(destAbs), { recursive: true })
  await fs.copyFile(srcAbs, destAbs)
}

async function stageUmbrellaRepo() {
  let copied = 0
  for (const { src, dest } of FILES) {
    const srcAbs = path.resolve(UMBRELLA_ROOT, src)
    const destAbs = path.resolve(STAGE_DIR, dest)
    if (!existsSync(srcAbs)) {
      console.warn(`[stage-umbrella-repo] skip missing: ${srcAbs}`)
      continue
    }
    await copyFile(srcAbs, destAbs)
    copied += 1
    console.log(`[stage-umbrella-repo] ${src} -> ${path.relative(PROJECTS_ROOT, destAbs)}`)
  }
  if (copied === 0) {
    console.error('[stage-umbrella-repo] no files copied; check umbrella root:', UMBRELLA_ROOT)
    process.exit(1)
  }
}

await stageUmbrellaRepo()