import type { ClassifiedPattern } from './patterns'
import type { HookRecord } from './hooks'
import type { ConfigSchema, ConfigEntry, GuardConfigEntry, ConfigField } from './content'
import type { FeedbackEvent } from './analytics'
import type { BannedWordsConfig } from './patterns'
import type { RequiredHooksConfig } from './hooks'

export interface SearchIndexEntry {
  id: string
  title: string
  section: string
  content: string
  href: string
  type: 'pattern' | 'hook' | 'config' | 'guard' | 'check' | 'page' | 'project'
  keywords: string[]
}

export interface PatternMatch {
  line: number
  column: number
  lineText: string
  pattern: string
  reason: string
  category: string
}

export interface ExtractedModule {
  name: string
  path: string
  docstring: string | null
  functions: ExtractedFunction[]
  classes: ExtractedClass[]
}

export interface ExtractedFunction {
  name: string
  docstring: string | null
  signature: string
  decorators: string[]
  line: number
  is_async: boolean
  is_public: boolean
}

export interface ExtractedClass {
  name: string
  docstring: string | null
  bases: string[]
  methods: ExtractedFunction[]
  line: number
}

export interface ApiDocsOutput {
  generated_at: string
  source_version: string
  modules: ExtractedModule[]
}

export interface ExtractedShellModule {
  name: string
  path: string
  description: string | null
  functions: ExtractedShellFunction[]
}

export interface ExtractedShellFunction {
  name: string
  description: string | null
  line: number
  is_public: boolean
}

export interface ShellDocsOutput {
  generated_at: string
  source_version: string
  modules: ExtractedShellModule[]
}

export interface ScriptManifestEntry {
  id: string
  path: string
  summary: string
  usage: string
  category: string
  args?: { name: string; description: string }[]
  output: string
  make_target?: string
}

export interface ScriptManifest {
  version: number
  scripts: ScriptManifestEntry[]
}

export type FeedbackTargetType = FeedbackEvent['targetType']

export type {
  ClassifiedPattern,
  HookRecord,
  ConfigSchema,
  ConfigEntry,
  GuardConfigEntry,
  ConfigField,
  BannedWordsConfig,
  RequiredHooksConfig,
}
