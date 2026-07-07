export type HookKind =
  | 'shell'
  | 'shell_inline'
  | 'shell_with_arg'
  | 'python_module'
  | 'python_module_files'
  | 'makefile_target'

export type HookStage = 'pre-commit' | 'commit-msg' | 'pre-push'

export interface HookRecord {
  id: string
  kind: HookKind
  entry: string
  stage: HookStage
  pass_filenames: boolean
  always_run: boolean
  files?: string
  files_types?: string[]
  mandatory: boolean
  safety: boolean
  applicable_to: string[]
}

export interface RequiredHooksConfig {
  version: number
  hooks: HookRecord[]
}

export type HookTier = 'strict' | 'poc'

function assertNever(value: never): never {
  throw new Error(`Unhandled tier: ${value}`)
}

export function hookRunsInTier(hook: HookRecord, tier: HookTier): boolean {
  switch (tier) {
    case 'strict':
      return true
    case 'poc':
      return hook.safety
    default:
      return assertNever(tier)
  }
}
