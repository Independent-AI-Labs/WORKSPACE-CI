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
  | 'policy-integrity'
  | 'self-methods'
  | 'special-chars'
  | 'filename-rules'
  | 'directory-rules'
  | 'error-swallowing'
  | 'ai-slop'
  | 'parasite-terms'
  | 'corporate-waffle'

export type DetectionType = 'inline' | 'custom' | 'multiline'

export type SwallowLanguage = 'shell' | 'python' | 'js_ts' | 'ansible' | 'cron'

export interface ClassifiedPattern {
  id?: string
  pattern: string
  reason: string
  category: PatternCategory
  categoryLabel: string
  scope: PatternScope
  directory?: string
  ruleScope?: RuleScope
  languages?: SwallowLanguage[]
  extensions?: string[]
  detectionType?: DetectionType
  detectorFunction?: string
  detectorSourceFile?: string
  detectorSource?: string
  detectorDocstring?: string
}

export type RuleScope = 'all' | 'production' | 'docs'

export type MatchingMode = 'raw-regex' | 'normalized-token' | 'normalized-path' | 'filename'

export interface BannedWordsConfig {
  version: string
  rules: PatternEntry[]
  directory_rules?: Record<string, PatternEntry[]>
  filename_rules?: PatternEntry[]
  exceptions?: PolicyException[]
}

export interface PatternEntry {
  id: string
  mode: MatchingMode
  case: 'sensitive' | 'fold'
  pattern: string
  reason: string
  category?: string
  scope?: RuleScope
  non_exemptible?: boolean
}

export interface PolicyException {
  rule: string
  path: string
  rationale: string
  owner: string
  review_date: string
  removal: string
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
  source_function?: string
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
  { id: 'policy-integrity', label: 'Policy Integrity' },
  { id: 'self-methods', label: 'Self Methods' },
  { id: 'special-chars', label: 'Special Characters' },
  { id: 'filename-rules', label: 'Filename Rules' },
  { id: 'directory-rules', label: 'Directory Rules' },
  { id: 'error-swallowing', label: 'Error Swallowing' },
  { id: 'ai-slop', label: 'AI Slop' },
  { id: 'parasite-terms', label: 'Parasite Terms' },
  { id: 'corporate-waffle', label: 'Corporate Waffle' },
]

export function getCategoryLabel(category: PatternCategory): string {
  const entry = PATTERN_CATEGORIES.find((c) => c.id === category)
  return entry?.label ?? category
}
