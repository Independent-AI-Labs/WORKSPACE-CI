import { WikiShell } from '@/components/wiki/WikiShell'
import { HookTableLoadingState } from '@/components/loading-states/HookTableLoadingState'

export default function HooksLoading() {
  return (
    <WikiShell>
      <HookTableLoadingState />
    </WikiShell>
  )
}
