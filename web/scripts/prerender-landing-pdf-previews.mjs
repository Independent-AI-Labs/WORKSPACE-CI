import fs from 'fs/promises'
import { existsSync, statSync } from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

process.on('uncaughtException', (err) => {
  console.error('[prerender-landing-pdf-previews] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[prerender-landing-pdf-previews] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const LANDING_DIR = path.resolve(WEB_DIR, 'public', 'landing')
const PREVIEW_DPI = 144

function abort(message) {
  console.error(message)
  process.exit(1)
}

function resolvePdftoppm() {
  const fromEnv = process.env.PDFTOPPM_BIN
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const which = spawnSync('which', ['pdftoppm'], { encoding: 'utf8' })
  if (which.status === 0) return which.stdout.trim()

  const candidates = ['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm']
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

async function collectPdfPaths(dir) {
  const paths = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await collectPdfPaths(fullPath)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      paths.push(fullPath)
    }
  }
  return paths
}

function previewIsStale(pdfPath, previewPath) {
  if (!existsSync(previewPath)) return true
  return statSync(pdfPath).mtimeMs > statSync(previewPath).mtimeMs
}

function renderPreview(pdftoppm, pdfPath, previewBase) {
  const result = spawnSync(
    pdftoppm,
    ['-png', '-f', '1', '-l', '1', '-singlefile', '-r', String(PREVIEW_DPI), pdfPath, previewBase],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(
      `pdftoppm failed for ${path.relative(WEB_DIR, pdfPath)}: ${result.stderr || result.stdout}`,
    )
  }
}

async function prerenderLandingPdfPreviews() {
  if (!existsSync(LANDING_DIR)) {
    console.log('[prerender-landing-pdf-previews] no public/landing directory, skipping')
    return
  }

  const pdftoppm = resolvePdftoppm()
  if (!pdftoppm) {
    abort(
      '[prerender-landing-pdf-previews] pdftoppm not found. Install poppler-utils ' +
        '(Debian: apt-get install -y poppler-utils).',
    )
  }

  const pdfPaths = await collectPdfPaths(LANDING_DIR)
  if (pdfPaths.length === 0) {
    console.log('[prerender-landing-pdf-previews] no landing PDFs found, skipping')
    return
  }

  let rendered = 0
  let skipped = 0

  for (const pdfPath of pdfPaths) {
    const previewBase = pdfPath.replace(/\.pdf$/i, '.preview')
    const previewPath = `${previewBase}.png`

    if (!previewIsStale(pdfPath, previewPath)) {
      skipped += 1
      continue
    }

    renderPreview(pdftoppm, pdfPath, previewBase)
    rendered += 1
    console.log(
      `[prerender-landing-pdf-previews] ${path.relative(WEB_DIR, pdfPath)} -> ${path.relative(WEB_DIR, previewPath)}`,
    )
  }

  console.log(
    `[prerender-landing-pdf-previews] done (${rendered} rendered, ${skipped} up-to-date, ${pdfPaths.length} total)`,
  )
}

await prerenderLandingPdfPreviews()