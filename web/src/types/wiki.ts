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
  type: 'pattern' | 'hook' | 'config' | 'guard' | 'check' | 'page' | 'project' | 'standard' | 'tooling'
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
