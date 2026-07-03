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

function classifyByReason(
  pattern: string,
  reason: string,
): PatternCategory {
  const lower = reason.toLowerCase()

  if (lower.includes('linter') || lower.includes('eslint') || lower.includes('noqa') || lower.includes('mypy') || lower.includes('type') && lower.includes('ignor')) {
    return 'linter-suppression'
  }
  if (lower.includes('untyped') || lower.includes('lazy') || lower.includes('zero type') || lower.includes('proper') && lower.includes('model')) {
    return 'deferred-types'
  }
  if (lower.includes('silent') || lower.includes('log') || lower.includes('swallow') || lower.includes('error') && lower.includes('explicit')) {
    return 'quiet-errors'
  }
  if (lower.includes('fallback') || lower.includes('backwards') || lower.includes('compat') || lower.includes('degrad') || lower.includes('legacy') || lower.includes('shim') || lower.includes('stub') || lower.includes('skeleton') || lower.includes('placeholder')) {
    return 'obsolete-paths'
  }
  if (lower.includes('suppress')) {
    return 'suppression'
  }
  if (lower.includes('getattr') || lower.includes('setattr') || lower.includes('hasattr') || lower.includes('dict') && lower.includes('access') || lower.includes('reflection') || lower.includes('importlib') || lower.includes('vars')) {
    return 'unsafe-reflection'
  }
  if (lower.includes('dataclass')) {
    return 'data-classes'
  }
  if (lower.includes('xfail')) {
    return 'test-quality'
  }
  if (lower.includes('home') || lower.includes('path') && lower.includes('navigation') || lower.includes('fragile') || lower.includes('parent')) {
    return 'path-safety'
  }
  if (lower.includes('uuid')) {
    return 'uuid'
  }
  if (lower.includes('latest') || lower.includes('container') || lower.includes('pin')) {
    return 'container-versions'
  }
  if (lower.includes('python3') || lower.includes('bare') || lower.includes('uv run')) {
    return 'deprecated-python'
  }
  if (lower.includes('self.') || lower.includes('dict-like') || lower.includes('self.get') || lower.includes('self.set')) {
    return 'self-methods'
  }
  if (lower.includes('em-dash') || lower.includes('en-dash') || lower.includes('unicode') || lower.includes('ascii') || lower.includes('dash')) {
    return 'special-chars'
  }
  if (lower.includes('filename') || lower.includes('versioned') || lower.includes('backup') || lower.includes('temp') || lower.includes('_old') || lower.includes('_new') || lower.includes('_fixed') || lower.includes('_tmp') || lower.includes('_copy') || lower.includes('_final')) {
    return 'filename-rules'
  }
  if (lower.includes('uncertain') || lower.includes('maybe')) {
    return 'obsolete-paths'
  }

  return 'special-chars'
}

export function classifyPattern(
  entry: PatternEntry,
  scope: PatternScope,
  directory?: string,
): ClassifiedPattern {
  const category =
    scope === 'filename'
      ? 'filename-rules'
      : scope === 'directory'
        ? 'directory-rules'
        : classifyByReason(entry.pattern, entry.reason)

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
