import { WikiShell } from '@/components/wiki/WikiShell'
import { HookTable } from '@/components/wiki/HookTable'
import { getRequiredHooks } from '@/lib/yaml-loader'

export default async function HooksPage() {
  const manifest = await getRequiredHooks()

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
        <HookTable hooks={manifest.hooks} />
      )}
    </WikiShell>
  )
}
