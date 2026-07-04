import { readFileSync } from 'fs'
import { join } from 'path'
import type { ApiDocsOutput, ShellDocsOutput } from '@/types/wiki'
import type { SwallowDetectorData } from '@/types/patterns'
import type { HookDescriptionData } from '@/types/hooks'
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

export function loadHookDescriptions(): HookDescriptionData | null {
  return loadJson<HookDescriptionData>(
    join(process.cwd(), 'src', 'data', 'hook-descriptions.json'),
  )
}

export function loadCodeStats(): CodeStatsData | null {
  return loadJson<CodeStatsData>(
    join(process.cwd(), 'src', 'data', 'code-stats.json'),
  )
}

export function loadHookSources(): EntryPointSourceData | null {
  return loadJson<EntryPointSourceData>(
    join(process.cwd(), 'src', 'data', 'hook-sources.json'),
  )
}

export function loadScriptSources(): EntryPointSourceData | null {
  return loadJson<EntryPointSourceData>(
    join(process.cwd(), 'src', 'data', 'script-sources.json'),
  )
}
