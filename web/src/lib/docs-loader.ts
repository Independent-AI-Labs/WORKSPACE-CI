import { readFileSync } from 'fs'
import { join } from 'path'
import { getWebDataRoot } from '@/lib/config-paths'
import type { SwallowDetectorData } from '@/types/patterns'
import type { CodeStatsData } from '@/types/code-stats'
import type { EntryPointSourceData } from '@/types/entry-point'

function loadJson<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export function loadSwallowDetectors(): SwallowDetectorData | null {
  return loadJson<SwallowDetectorData>(
    join(getWebDataRoot(), 'swallow-detectors.json'),
  )
}

export function loadCodeStats(): CodeStatsData | null {
  return loadJson<CodeStatsData>(
    join(getWebDataRoot(), 'code-stats.json'),
  )
}

export function loadHookSources(): EntryPointSourceData | null {
  return loadJson<EntryPointSourceData>(
    join(getWebDataRoot(), 'hook-sources.json'),
  )
}

export function loadScriptSources(): EntryPointSourceData | null {
  return loadJson<EntryPointSourceData>(
    join(getWebDataRoot(), 'script-sources.json'),
  )
}
