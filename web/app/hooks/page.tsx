import { WikiShell } from '@/components/wiki/WikiShell'
import { HookList } from '@/components/wiki/HookList'
import { getRequiredHooks } from '@/lib/yaml-loader'
import { loadHookDescriptions } from '@/lib/docs-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'

export default async function HooksPage() {
  const manifest = await getRequiredHooks()
  const descData = loadHookDescriptions()
  const descriptions = descData?.descriptions ?? {}
  const feedbackCounts = getAllFeedbackCounts('hook')

  return (
    <WikiShell>
      <h1>Hook Reference</h1>
      <p className="page-intro">
        Required git hooks organized by stage (pre-commit, commit-msg,
        pre-push) and kind (shell, python module, makefile target).
      </p>
      {manifest.hooks.length === 0 ? (
        <p className="empty-state">
          No hooks found. Check that the required hooks manifest is
          accessible at WORKSPACE_CI_CONFIG_ROOT.
        </p>
      ) : (
        <HookList
          hooks={manifest.hooks}
          descriptions={descriptions}
          feedbackCounts={feedbackCounts}
        />
      )}
    </WikiShell>
  )
}
