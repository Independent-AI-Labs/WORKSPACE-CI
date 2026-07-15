import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
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

function abortOrWarn(message) {
  if (process.env.CI_WIKI_PROD_BUILD === '1') {
    console.error(message)
    process.exit(1)
  }
  console.warn(message)
}

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'google-chrome',
  'google-chrome-stable',
  'chromium-browser',
  'chromium',
].filter(Boolean)

function resolveContentRoot() {
  if (process.env.WORKSPACE_WEB_CONTENT_ROOT) {
    return path.resolve(process.env.WORKSPACE_WEB_CONTENT_ROOT)
  }
  const sibling = path.resolve(PROJECTS_ROOT, 'WORKSPACE-WEB-CONTENT')
  if (existsSync(sibling)) return sibling
  return null
}

function isPdfBuffer(buf) {
  return buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF'
}

function resolveChromeBinary() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate.includes('/')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    const result = spawnSync('which', [candidate], { encoding: 'utf8' })
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim()
    }
    if (result.status !== 0 && result.stderr?.trim()) {
      console.error(`[fetch-web-documents] which ${candidate}: ${result.stderr.trim()}`)
    }
  }
  return null
}

async function readPdfFile(filePath) {
  const buf = await fs.readFile(filePath)
  if (!isPdfBuffer(buf)) {
    throw new Error(`${filePath}: expected PDF output`)
  }
  return buf
}

async function convertHtmlUrlToPdf(sourceUrl, dest) {
  const chrome = resolveChromeBinary()
  if (!chrome) {
    throw new Error('html_to_pdf requires google-chrome or chromium on PATH (set CHROME_BIN)')
  }
  const tmpPdf = `${dest}.tmp`
  await fs.rm(tmpPdf, { force: true })
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=25000',
    `--print-to-pdf=${tmpPdf}`,
    sourceUrl,
  ]
  const result = spawnSync(chrome, args, {
    stdio: 'inherit',
    timeout: 120_000,
  })
  if (result.status !== 0) {
    throw new Error(`${sourceUrl}: chrome print-to-pdf exited ${result.status ?? 'unknown'}`)
  }
  const buf = await readPdfFile(tmpPdf)
  if (buf.length < 10_000) {
    throw new Error(`${sourceUrl}: converted PDF too small (${buf.length} bytes)`)
  }
  await fs.rename(tmpPdf, dest)
  return buf.length
}

async function downloadDirect(fetchUrl) {
  const res = await fetch(fetchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; workspace-ci-wiki/1.0)' },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${fetchUrl}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) {
    throw new Error(`empty response from ${fetchUrl}`)
  }
  return buf
}

async function downloadDocument(postsDir, doc) {
  const dest = path.join(postsDir, doc.file)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const mode = doc.fetch_mode ?? 'direct'
  const wantsPdf = doc.file.toLowerCase().endsWith('.pdf')

  if (mode === 'html_to_pdf') {
    if (!wantsPdf) {
      throw new Error(`${doc.id}: html_to_pdf requires a .pdf destination file`)
    }
    const forceFetch = process.env.WIKI_FORCE_FETCH_DOCUMENTS === '1'
    const isProd = process.env.CI_WIKI_PROD_BUILD === '1'
    if (!forceFetch && existsSync(dest)) {
      const existing = await fs.readFile(dest)
      if (isPdfBuffer(existing) && existing.length >= 10_000) {
        if (!isProd) {
          console.log(
            `[fetch-web-documents] ${doc.id}: reusing existing PDF (${existing.length} bytes)`,
          )
          return { bytes: existing.length, method: 'existing_pdf' }
        }
      }
    }
    if (!resolveChromeBinary()) {
      if (existsSync(dest)) {
        const existing = await fs.readFile(dest)
        if (isPdfBuffer(existing) && existing.length >= 10_000) {
          abortOrWarn(`[fetch-web-documents] ${doc.id}: chrome missing; keeping existing PDF`)
          return { bytes: existing.length, method: 'existing_pdf' }
        }
      }
      throw new Error(`${doc.id}: html_to_pdf requires google-chrome or chromium on PATH (set CHROME_BIN)`)
    }
    const bytes = await convertHtmlUrlToPdf(doc.fetch_url, dest)
    return { bytes, method: 'html_to_pdf' }
  }

  const buf = await downloadDirect(doc.fetch_url)
  if (wantsPdf && !isPdfBuffer(buf)) {
    console.warn(`[fetch-web-documents] ${doc.id}: direct fetch was not PDF; converting HTML`)
    await fs.writeFile(`${dest}.source.html`, buf)
    const bytes = await convertHtmlUrlToPdf(doc.fetch_url, dest)
    return { bytes, method: 'html_to_pdf_fallback' }
  }

  await fs.writeFile(dest, buf)
  return { bytes: buf.length, method: 'direct' }
}

async function fetchWebDocuments() {
  const contentRoot = resolveContentRoot()
  if (!contentRoot) {
    abortOrWarn('[fetch-web-documents] WORKSPACE-WEB-CONTENT not found; skipping')
    return
  }
  const docsYaml = path.join(contentRoot, 'documents.yaml')
  if (!existsSync(docsYaml)) {
    abortOrWarn(`[fetch-web-documents] missing ${docsYaml}; skipping`)
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
    const { bytes, method } = await downloadDocument(postsDir, doc)
    console.log(`[fetch-web-documents] ${doc.id}: ${bytes} bytes (${method}) -> posts/${doc.file}`)
  }
}

await fetchWebDocuments()