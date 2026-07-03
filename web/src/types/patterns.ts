export type PatternScope = 'content' | 'filename' | 'directory'

export type PatternCategory =
  | 'linter-suppression'
  | 'deferred-types'
  | 'quiet-errors'
  | 'obsolete-paths'
  | 'suppression'
  | 'unsafe-reflection'
  | 'data-classes'
  | 'test-quality'
  | 'path-safety'
  | 'uuid'
  | 'container-versions'
  | 'deprecated-python'
  | 'self-methods'
  | 'special-chars'
  | 'filename-rules'
  | 'directory-rules'
  | 'error-swallowing'

export type DetectionType = 'inline' | 'custom' | 'multiline'

export type SwallowLanguage = 'shell' | 'python' | 'js_ts' | 'ansible' | 'cron'

export interface ClassifiedPattern {
  pattern: string
  reason: string
  category: PatternCategory
  categoryLabel: string
  scope: PatternScope
  directory?: string
  languages?: SwallowLanguage[]
  extensions?: string[]
  detectionType?: DetectionType
  detectorFunction?: string
  detectorSourceFile?: string
  detectorSource?: string
  detectorDocstring?: string
}

export interface BannedWordsConfig {
  version: string
  universal_exceptions?: UniversalException[]
  banned: PatternEntry[]
  directory_rules?: Record<string, PatternEntry[]>
  filename_rules?: PatternEntry[]
}

export interface PatternEntry {
  pattern: string
  reason: string
}

export interface UniversalException {
  paths: string[]
  patterns: string[]
}

export interface SwallowInlinePattern {
  id: string
  regex: string
  language: SwallowLanguage
  description: string
}

export interface SwallowDetectorPattern {
  id: string
  detector: string
  source_file: string
  language: SwallowLanguage
  description: string
}

export interface SwallowFileType {
  extensions?: string[]
  filenames?: string[]
  shebang?: string
  path_includes?: string[]
}

export interface SwallowPatternConfig {
  version: number
  file_types: Record<string, SwallowFileType>
  inline_patterns: SwallowInlinePattern[]
  custom_detectors?: SwallowDetectorPattern[]
  multiline_detectors?: SwallowDetectorPattern[]
}

export interface SwallowDetectorEntry {
  name: string
  source_file: string
  docstring: string | null
  source: string
}

export interface SwallowDetectorData {
  generated_at: string
  source_version: string
  detectors: SwallowDetectorEntry[]
}

export const PATTERN_CATEGORIES: { id: PatternCategory; label: string }[] = [
  { id: 'linter-suppression', label: 'Linter Suppression' },
  { id: 'deferred-types', label: 'Deferred Types' },
  { id: 'quiet-errors', label: 'Quiet Errors' },
  { id: 'obsolete-paths', label: 'Obsolete Paths' },
  { id: 'suppression', label: 'Suppression' },
  { id: 'unsafe-reflection', label: 'Unsafe Reflection' },
  { id: 'data-classes', label: 'Data Classes' },
  { id: 'test-quality', label: 'Test Quality' },
  { id: 'path-safety', label: 'Path Safety' },
  { id: 'uuid', label: 'UUID' },
  { id: 'container-versions', label: 'Container Versions' },
  { id: 'deprecated-python', label: 'Deprecated Python' },
  { id: 'self-methods', label: 'Self Methods' },
  { id: 'special-chars', label: 'Special Characters' },
  { id: 'filename-rules', label: 'Filename Rules' },
  { id: 'directory-rules', label: 'Directory Rules' },
  { id: 'error-swallowing', label: 'Error Swallowing' },
]

export function getCategoryLabel(category: PatternCategory): string {
  const entry = PATTERN_CATEGORIES.find((c) => c.id === category)
  return entry?.label ?? category
}
