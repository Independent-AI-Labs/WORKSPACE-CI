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

export interface ClassifiedPattern {
  pattern: string
  reason: string
  category: PatternCategory
  categoryLabel: string
  scope: PatternScope
  directory?: string
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
]

export function getCategoryLabel(category: PatternCategory): string {
  const entry = PATTERN_CATEGORIES.find((c) => c.id === category)
  return entry?.label ?? category
}
