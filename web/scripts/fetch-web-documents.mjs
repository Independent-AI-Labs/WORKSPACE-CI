import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { load } from 'js-yaml'

process.on('uncaughtException', (err) => {
  console.error('[fetch-web-documents] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[fetch-web-documents] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? path.resolve(WEB_DIR, '..', '..')

function resolveContentRoot() {
  if (process.env.WORKSPACE_WEB_CONTENT_ROOT) {
    return path.resolve(process.env.WORKSPACE_WEB_CONTENT_ROOT)
  }
  const sibling = path.resolve(PROJECTS_ROOT, 'WORKSPACE-WEB-CONTENT')
  if (existsSync(sibling)) return sibling
  return null
}

async function downloadDocument(postsDir, doc) {
  const dest = path.join(postsDir, doc.file)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const res = await fetch(doc.fetch_url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; workspace-ci-wiki/1.0)' },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`${doc.id}: HTTP ${res.status} for ${doc.fetch_url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) {
    throw new Error(`${doc.id}: empty response from ${doc.fetch_url}`)
  }
  await fs.writeFile(dest, buf)
  return buf.length
}

async function fetchWebDocuments() {
  const contentRoot = resolveContentRoot()
  if (!contentRoot) {
    console.warn('[fetch-web-documents] WORKSPACE-WEB-CONTENT not found; skipping')
    return
  }
  const docsYaml = path.join(contentRoot, 'documents.yaml')
  if (!existsSync(docsYaml)) {
    console.warn(`[fetch-web-documents] missing ${docsYaml}; skipping`)
    return
  }
  const raw = await fs.readFile(docsYaml, 'utf8')
  const config = load(raw)
  const documents = config.documents ?? []
  const postsDir = path.join(contentRoot, 'posts')
  for (const doc of documents) {
    if (!doc.id || !doc.file || !doc.fetch_url) {
      throw new Error('[fetch-web-documents] document entry missing id, file, or fetch_url')
    }
    const bytes = await downloadDocument(postsDir, doc)
    console.log(`[fetch-web-documents] ${doc.id}: ${bytes} bytes -> posts/${doc.file}`)
  }
}

await fetchWebDocuments()