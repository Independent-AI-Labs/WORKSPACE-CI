import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { load } from 'js-yaml'

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

function abort(message) {
  console.error(message)
  process.exit(1)
}

function resolveContentRoot() {
  if (process.env.WORKSPACE_WEB_CONTENT_ROOT) {
    return path.resolve(process.env.WORKSPACE_WEB_CONTENT_ROOT)
  }
  const sibling = path.resolve(PROJECTS_ROOT, 'WORKSPACE-WEB-CONTENT')
  if (existsSync(sibling)) return sibling
  return null
}

async function copyDirMerge(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDirMerge(srcPath, destPath)
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

async function mirrorPostAssets(postsSrc, landingDest, postIds) {
  await fs.mkdir(landingDest, { recursive: true })
  const activeIds = new Set(postIds)

  const existing = await fs.readdir(landingDest, { withFileTypes: true })
  for (const entry of existing) {
    if (!entry.isDirectory()) continue
    if (!activeIds.has(entry.name)) {
      await fs.rm(path.join(landingDest, entry.name), { recursive: true, force: true })
      console.log(`[sync-web-content] removed stale ${path.relative(WEB_DIR, path.join(landingDest, entry.name))}`)
    }
  }

  for (const id of postIds) {
    const srcDir = path.join(postsSrc, id)
    const destDir = path.join(landingDest, id)
    if (!existsSync(srcDir)) {
      abort(`[sync-web-content] missing posts/${id}/ under WORKSPACE-WEB-CONTENT`)
    }
    await fs.rm(destDir, { recursive: true, force: true })
    await copyDirMerge(srcDir, destDir)
    console.log(
      `[sync-web-content] posts/${id} -> ${path.relative(WEB_DIR, destDir)}`,
    )
  }
}

function postIds(config) {
  if (!config || typeof config !== 'object') return []
  const posts = config.posts
  if (!Array.isArray(posts)) return []
  return posts.map((p) => p?.id).filter((id) => typeof id === 'string')
}

async function readYamlPostIds(filePath) {
  if (!existsSync(filePath)) return []
  const raw = await fs.readFile(filePath, 'utf8')
  return postIds(load(raw))
}

async function assertYamlWillNotDropPosts(yamlSrc, yamlDest) {
  const srcIds = new Set(await readYamlPostIds(yamlSrc))
  const destIds = await readYamlPostIds(yamlDest)
  const dropped = destIds.filter((id) => !srcIds.has(id))
  if (dropped.length === 0) return

  abort(
    `[sync-web-content] refusing to sync landing-posts.yaml: ` +
      `WORKSPACE-WEB-CONTENT is missing post id(s) still in wiki: ${dropped.join(', ')}. ` +
      `Add them to WORKSPACE-WEB-CONTENT/landing-posts.yaml before syncing.`,
  )
}

async function syncWebContent() {
  const contentRoot = resolveContentRoot()
  if (!contentRoot) {
    abort(
      '[sync-web-content] WORKSPACE-WEB-CONTENT not found (set WORKSPACE_WEB_CONTENT_ROOT)',
    )
  }

  const yamlSrc = path.join(contentRoot, 'landing-posts.yaml')
  if (!existsSync(yamlSrc)) {
    abort(`[sync-web-content] missing ${yamlSrc}`)
  }

  const contentDestDir = path.resolve(WEB_DIR, 'content')
  await fs.mkdir(contentDestDir, { recursive: true })
  const yamlDest = path.join(contentDestDir, 'landing-posts.yaml')
  await assertYamlWillNotDropPosts(yamlSrc, yamlDest)
  await fs.copyFile(yamlSrc, yamlDest)
  console.log(`[sync-web-content] yaml -> ${path.relative(WEB_DIR, yamlDest)}`)

  const raw = await fs.readFile(yamlSrc, 'utf8')
  const ids = postIds(load(raw))
  if (ids.length === 0) {
    abort('[sync-web-content] landing-posts.yaml: posts must be a non-empty list')
  }

  const postsSrc = path.join(contentRoot, 'posts')
  if (!existsSync(postsSrc)) {
    abort(`[sync-web-content] missing ${postsSrc}`)
  }
  const landingDest = path.resolve(WEB_DIR, 'public', 'landing')
  await mirrorPostAssets(postsSrc, landingDest, ids)
  await import('./prerender-landing-pdf-previews.mjs')
}

await syncWebContent()