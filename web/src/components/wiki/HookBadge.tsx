import clsx from 'clsx'

interface HookBadgeProps {
  variant: 'stage' | 'kind' | 'tier'
  value: string
}

const COLORS: Record<string, string> = {
  'pre-commit': 'badge--green',
  'commit-msg': 'badge--blue',
  'pre-push': 'badge--orange',
  shell: 'badge--teal',
  shell_inline: 'badge--teal',
  shell_with_arg: 'badge--teal',
  python_module: 'badge--purple',
  python_module_files: 'badge--purple',
  makefile_target: 'badge--gray',
  safety: 'badge--green',
  strict: 'badge--orange',
}

export function HookBadge({ variant, value }: HookBadgeProps) {
  return (
    <span
      className={clsx('hook-badge', COLORS[value] ?? 'badge--gray')}
    >
      <span className="sr-only">{variant}: </span>
      {value}
    </span>
  )
}
