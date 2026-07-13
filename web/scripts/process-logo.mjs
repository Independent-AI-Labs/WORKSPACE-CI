import { existsSync } from 'fs'
import path from 'path'
import sharp from 'sharp'

process.on('uncaughtException', (err) => {
  console.error('[process-logo] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[process-logo] unhandledRejection:', reason)
  process.exit(1)
})

// Canonical navy used by CI / Gateway catalogue logos (mask-friendly single fill).
const NAVY = { r: 38, g: 55, b: 71 }

function isBackground(r, g, b, a) {
  if (a < 16) return true
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  // Off-white / cream studio backdrops in LOGO_RAW assets.
  return min > 215 && (max - min) < 28
}

function foregroundAlpha(r, g, b) {
  const min = Math.min(r, g, b)
  if (min < 120) return 255
  const t = (200 - min) / (200 - 120)
  return Math.min(255, Math.max(0, Math.round(t * 255)))
}

async function processLogo(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (isBackground(r, g, b, a)) {
      out[i] = 0
      out[i + 1] = 0
      out[i + 2] = 0
      out[i + 3] = 0
      continue
    }
    out[i] = NAVY.r
    out[i + 1] = NAVY.g
    out[i + 2] = NAVY.b
    out[i + 3] = foregroundAlpha(r, g, b)
  }

  await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim()
    .png()
    .toFile(outputPath)

  const final = await sharp(outputPath).metadata()
  console.log(
    `[process-logo] ${path.basename(inputPath)} -> ${path.basename(outputPath)} `
      + `(${info.width}x${info.height} -> ${final.width}x${final.height})`,
  )
}

const input = process.argv[2]
const output = process.argv[3]
if (!input || !output) {
  console.error('Usage: node scripts/process-logo.mjs <LOGO_RAW.png> <LOGO.png>')
  process.exit(1)
}
if (!existsSync(input)) {
  console.error(`[process-logo] missing input: ${input}`)
  process.exit(1)
}

await processLogo(input, output)