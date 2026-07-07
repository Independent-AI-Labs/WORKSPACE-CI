import type { HookKind } from '@/types/hooks'
import type { SwallowLanguage } from '@/types/patterns'
import type { StandardType } from '@/types/standards'

export interface StandardTypeMeta {
  label: string
  icon: string
}

export interface PlaygroundLanguage {
  id: string
  label: string
}

export interface WikiLabelsConfig {
  version: number
  hook_stages: Record<string, string>
  hook_kinds: Record<HookKind, string>
  standard_types: Record<StandardType, StandardTypeMeta>
  swallow_languages: Record<SwallowLanguage, string>
  config_categories: Record<string, string>
  guard_categories: Record<string, string>
  playground_languages: PlaygroundLanguage[]
}
