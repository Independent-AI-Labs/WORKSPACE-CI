import { readFileSync } from 'fs'
import { join } from 'path'
import type { ApiDocsOutput, ShellDocsOutput } from '@/types/wiki'
import type { SwallowDetectorData } from '@/types/patterns'

function loadJson<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export function loadApiDocs(): ApiDocsOutput | null {
  return loadJson<ApiDocsOutput>(
    join(process.cwd(), 'src', 'data', 'api-docs.json'),
  )
}

export function loadShellDocs(): ShellDocsOutput | null {
  return loadJson<ShellDocsOutput>(
    join(process.cwd(), 'src', 'data', 'shell-docs.json'),
  )
}

export function loadSwallowDetectors(): SwallowDetectorData | null {
  return loadJson<SwallowDetectorData>(
    join(process.cwd(), 'src', 'data', 'swallow-detectors.json'),
  )
}
