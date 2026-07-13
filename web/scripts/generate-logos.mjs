import fs from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_DIR = path.resolve(__dirname, '..')
const PROJECTS_ROOT = process.env.WORKSPACE_PROJECTS_ROOT
  ?? path.resolve(WEB_DIR, '..', '..')
const REMIX_ROOT = path.resolve(WEB_DIR, 'node_modules', 'remixicon', 'icons')

// Catalogue navy: mask-friendly single fill (matches process-logo.mjs / CI finals).
const NAVY = '#263847'
const CANVAS = 512
const ICON_PADDING = 96 // 24px icon grid centered in 512px canvas (~62% scale)

const PROJECTS = [
  {
    slug: 'workspace-vm',
    repoName: 'WORKSPACE-VM',
    resDir: path.resolve(PROJECTS_ROOT, '..', 'res'),
    remixIcon: 'Device/server-line.svg',
  },
  {
    slug: 'workspace-ci',
    repoName: 'CI',
    resDir: path.resolve(PROJECTS_ROOT, 'CI', 'res'),
    remixIcon: 'Development/terminal-box-line.svg',
  },
  {
    slug: 'workspace-gateway',
    repoName: 'WORKSPACE-GATEWAY',
    resDir: path.resolve(PROJECTS_ROOT, 'WORKSPACE-GATEWAY', 'res'),
    remixIcon: 'Map/globe-line.svg',
  },
  {
    slug: 'workspace-guard',
    repoName: 'WORKSPACE-GUARD',
    resDir: path.resolve(PROJECTS_ROOT, 'WORKSPACE-GUARD', 'res'),
    remixIcon: 'System/shield-keyhole-line.svg',
  },
]

function extractPath(svgText) {
  const match = svgText.match(/<path[^>]*d="([^"]+)"/)
  if (!match) throw new Error('no <path d="..."> found in remixicon svg')
  return match[1]
}

function buildLogoSvg(pathD) {
  const size = CANVAS - ICON_PADDING * 2
  const x = ICON_PADDING
  const y = ICON_PADDING
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <g transform="translate(${x} ${y}) scale(${size / 24})">
    <path d="${pathD}" fill="${NAVY}"/>
  </g>
</svg>`
}

async function writeLogoSet({ slug, resDir, remixIcon }) {
  const remixPath = path.join(REMIX_ROOT, remixIcon)
  if (!existsSync(remixPath)) {
    throw new Error(`remixicon missing: ${remixPath}`)
  }
  const pathD = extractPath(readFileSync(remixPath, 'utf8'))
  const svg = buildLogoSvg(pathD)
  await fs.mkdir(resDir, { recursive: true })

  const svgOut = path.join(resDir, 'LOGO.svg')
  const rawOut = path.join(resDir, 'LOGO_RAW.png')
  const logoOut = path.join(resDir, 'LOGO.png')

  await fs.writeFile(svgOut, svg, 'utf8')
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  await fs.writeFile(rawOut, png)
  await fs.writeFile(logoOut, png)

  const meta = await sharp(png).metadata()
  console.log(
    `[generate-logos] ${slug}: ${remixIcon} -> ${meta.width}x${meta.height} `
      + `(${path.relative(PROJECTS_ROOT, resDir)}/LOGO.png)`,
  )
}

for (const project of PROJECTS) {
  await writeLogoSet(project)
}