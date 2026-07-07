import type {
  BannedWordsConfig,
  ClassifiedPattern,
  PatternEntry,
  PatternCategory,
  PatternScope,
  SwallowPatternConfig,
  SwallowDetectorData,
  SwallowDetectorEntry,
  SwallowLanguage,
  DetectionType,
} from '@/types/patterns'
import { getCategoryLabel } from '@/types/patterns'

function resolveCategory(
  entry: PatternEntry,
  scope: PatternScope,
): PatternCategory {
  if (scope === 'filename') return 'filename-rules'
  if (scope === 'directory') return 'directory-rules'
  const cat = entry.category as PatternCategory | undefined
  if (cat) return cat
  return 'special-chars'
}

export function classifyPattern(
  entry: PatternEntry,
  scope: PatternScope,
  directory?: string,
): ClassifiedPattern {
  const category = resolveCategory(entry, scope)

  return {
    pattern: entry.pattern,
    reason: entry.reason,
    category,
    categoryLabel: getCategoryLabel(category),
    scope,
    directory,
  }
}

export function classifyAll(config: BannedWordsConfig): ClassifiedPattern[] {
  const results: ClassifiedPattern[] = []

  for (const entry of config.banned ?? []) {
    results.push(classifyPattern(entry, 'content'))
  }

  if (config.directory_rules) {
    for (const [dir, entries] of Object.entries(config.directory_rules)) {
      for (const entry of entries) {
        results.push(classifyPattern(entry, 'directory', dir))
      }
    }
  }

  if (config.filename_rules) {
    for (const entry of config.filename_rules) {
      results.push(classifyPattern(entry, 'filename'))
    }
  }

  return results
}

function buildDetectorMap(
  data: SwallowDetectorData | null,
): Record<string, SwallowDetectorEntry> {
  if (!data) return {}
  const map: Record<string, SwallowDetectorEntry> = {}
  for (const d of data.detectors) {
    map[d.name] = d
  }
  return map
}

function getExtensions(
  config: SwallowPatternConfig,
  language: SwallowLanguage,
): string[] {
  const ft = config.file_types[language]
  return ft?.extensions ?? []
}

export function classifySwallowPatterns(
  config: SwallowPatternConfig,
  detectorData: SwallowDetectorData | null,
): ClassifiedPattern[] {
  const results: ClassifiedPattern[] = []
  const detectorMap = buildDetectorMap(detectorData)

  for (const p of config.inline_patterns ?? []) {
    results.push({
      pattern: p.regex,
      reason: p.description,
      category: 'error-swallowing',
      categoryLabel: getCategoryLabel('error-swallowing'),
      scope: 'content',
      languages: [p.language],
      extensions: getExtensions(config, p.language),
      detectionType: 'inline' as DetectionType,
    })
  }

  for (const p of config.custom_detectors ?? []) {
    const det = detectorMap[p.detector]
    results.push({
      pattern: p.id,
      reason: p.description,
      category: 'error-swallowing',
      categoryLabel: getCategoryLabel('error-swallowing'),
      scope: 'content',
      languages: [p.language],
      extensions: getExtensions(config, p.language),
      detectionType: 'custom' as DetectionType,
      detectorFunction: p.detector,
      detectorSourceFile: det?.source_file,
      detectorSource: det?.source,
      detectorDocstring: det?.docstring ?? undefined,
    })
  }

  for (const p of config.multiline_detectors ?? []) {
    const fnName = p.source_function ?? p.detector
    const det = detectorMap[fnName]
    results.push({
      pattern: p.id,
      reason: p.description,
      category: 'error-swallowing',
      categoryLabel: getCategoryLabel('error-swallowing'),
      scope: 'content',
      languages: [p.language],
      extensions: getExtensions(config, p.language),
      detectionType: 'multiline' as DetectionType,
      detectorFunction: fnName,
      detectorSourceFile: det?.source_file,
      detectorSource: det?.source,
      detectorDocstring: det?.docstring ?? undefined,
    })
  }

  return results
}
