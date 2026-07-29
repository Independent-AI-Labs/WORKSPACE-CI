import fs from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { load } from 'js-yaml'

process.on('uncaughtException', (err) => {
  console.error('[sync-wiki-nav] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[sync-wiki-nav] unhandledRejection:', reason)
  process.exit(1)
})

const WEB_DIR = process.cwd()
const NAV_PATH = path.resolve(WEB_DIR, 'nav.yaml')
const OUT_PATH = path.resolve(WEB_DIR, 'src', 'data', 'wiki-nav.json')
const CHECK_ONLY = process.argv.includes('--check')

function abort(message) {
  console.error(message)
  process.exit(1)
}

export function collectNav() {
  if (!existsSync(NAV_PATH)) {
    abort(`[sync-wiki-nav] missing route manifest: ${NAV_PATH}`)
  }
  const raw = load(readFileSync(NAV_PATH, 'utf8'))
  const pages = raw?.pages
  if (!Array.isArray(pages) || pages.length === 0) {
    abort(`[sync-wiki-nav] ${NAV_PATH}: no pages defined`)
  }
  const items = []
  for (const page of pages) {
    if (!page.href || !page.nav) continue
    if (typeof page.nav.label !== 'string' || typeof page.nav.icon !== 'string') {
      abort(`[sync-wiki-nav] ${page.id ?? page.href}: nav.label and nav.icon are required`)
    }
    const item = { href: page.href, label: page.nav.label, icon: page.nav.icon }
    if (page.nav.count) item.count = page.nav.count
    if (page.nav.divider) item.divider = true
    items.push(item)
  }
  return items
}

function render(items) {
  return JSON.stringify({ version: 1, items }, null, 2) + '\n'
}

async function main() {
  const items = collectNav()
  if (items.length === 0) {
    abort('[sync-wiki-nav] no nav entries found in nav.yaml')
  }
  const output = render(items)
  if (CHECK_ONLY) {
    if (!existsSync(OUT_PATH)) {
      abort(`[sync-wiki-nav] ${OUT_PATH} is missing; run: node scripts/sync-wiki-nav.mjs`)
    }
    const current = readFileSync(OUT_PATH, 'utf8')
    if (current !== output) {
      abort(`[sync-wiki-nav] ${OUT_PATH} is stale; run: node scripts/sync-wiki-nav.mjs`)
    }
    console.log('[sync-wiki-nav] nav data is up to date')
    return
  }
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(OUT_PATH, output)
  console.log(
    `[sync-wiki-nav] wrote ${items.length} nav items -> ${path.relative(WEB_DIR, OUT_PATH)}`
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  await main()
}
