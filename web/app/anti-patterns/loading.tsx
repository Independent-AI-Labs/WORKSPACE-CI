import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternGridLoadingState } from '@workspace-ci/web-components/components/PatternGridLoadingState'

export default function PatternsLoading() {
  return (
    <WikiShell>
      <PatternGridLoadingState />
    </WikiShell>
  )
}
