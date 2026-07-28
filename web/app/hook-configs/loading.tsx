import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigTableLoadingState } from '@workspace-ci/web-components/components/ConfigTableLoadingState'

export default function ConfigLoading() {
  return (
    <WikiShell>
      <ConfigTableLoadingState />
    </WikiShell>
  )
}
