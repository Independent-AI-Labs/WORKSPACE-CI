import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

process.on('uncaughtException', (err) => {
  console.error('[sync-web-content] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[sync-web-content] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? path.resolve(WEB_DIR, '..', '..')

function abortOrWarn(message) {
  if (process.env.CI_WIKI_PROD_BUILD === '1') {
    console.error(message)
    process.exit(1)
  }
  console.warn(message)
}

function resolveContentRoot() {
  if (process.env.WORKSPACE_WEB_CONTENT_ROOT) {
    return path.resolve(process.env.WORKSPACE_WEB_CONTENT_ROOT)
  }
  const sibling = path.resolve(PROJECTS_ROOT, 'WORKSPACE-WEB-CONTENT')
  if (existsSync(sibling)) return sibling
  return null
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

async function syncWebContent() {
  const contentRoot = resolveContentRoot()
  if (!contentRoot) {
    abortOrWarn(
      '[sync-web-content] WORKSPACE-WEB-CONTENT not found; skipping (set WORKSPACE_WEB_CONTENT_ROOT)',
    )
    return
  }

  const yamlSrc = path.join(contentRoot, 'landing-posts.yaml')
  if (!existsSync(yamlSrc)) {
    abortOrWarn(`[sync-web-content] missing ${yamlSrc}; skipping`)
    return
  }

  const contentDestDir = path.resolve(WEB_DIR, 'content')
  await fs.mkdir(contentDestDir, { recursive: true })
  const yamlDest = path.join(contentDestDir, 'landing-posts.yaml')
  await fs.copyFile(yamlSrc, yamlDest)
  console.log(`[sync-web-content] yaml -> ${path.relative(WEB_DIR, yamlDest)}`)

  const postsSrc = path.join(contentRoot, 'posts')
  if (existsSync(postsSrc)) {
    const landingDest = path.resolve(WEB_DIR, 'public', 'landing')
    await fs.rm(landingDest, { recursive: true, force: true })
    await copyDir(postsSrc, landingDest)
    console.log(`[sync-web-content] posts -> ${path.relative(WEB_DIR, landingDest)}`)
  }
}

await syncWebContent()