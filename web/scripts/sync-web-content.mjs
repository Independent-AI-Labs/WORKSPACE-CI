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

function abortOrWarn(message) {
  if (process.env.CI_WIKI_PROD_BUILD === '1') {
    console.error(message)
    process.exit(1)
  }
  console.warn(message)
}

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

/** Merge copy: overwrite matching paths, never delete extra files or dirs in dest. */
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

function postIds(config) {
  if (!config || typeof config !== 'object') return []
  const posts = config.posts
  if (!Array.isArray(posts)) return []
  return posts.map((p) => p?.id).filter((id) => typeof id === 'string')
}

async function readYamlPostIds(filePath) {
  if (!existsSync(filePath)) return []
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return postIds(load(raw))
  } catch (err) {
    console.warn(`[sync-web-content] could not parse ${filePath}: ${err.message}`)
    return []
  }
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
  await assertYamlWillNotDropPosts(yamlSrc, yamlDest)
  await fs.copyFile(yamlSrc, yamlDest)
  console.log(`[sync-web-content] yaml -> ${path.relative(WEB_DIR, yamlDest)}`)

  const postsSrc = path.join(contentRoot, 'posts')
  if (existsSync(postsSrc)) {
    const landingDest = path.resolve(WEB_DIR, 'public', 'landing')
    await copyDirMerge(postsSrc, landingDest)
    console.log(
      `[sync-web-content] posts -> ${path.relative(WEB_DIR, landingDest)} (merge; extra wiki assets kept)`,
    )
  }
}

await syncWebContent()