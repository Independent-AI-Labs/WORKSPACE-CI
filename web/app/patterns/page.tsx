import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternList } from '@/components/wiki/PatternList'
import { getBannedPatterns } from '@/lib/yaml-loader'
import { classifyAll } from '@/lib/patterns'

export default async function PatternsPage() {
  const config = await getBannedPatterns()
  const allPatterns = classifyAll(config)

  return (
    <WikiShell>
      <h1>Pattern Library</h1>
      <p className="page-intro">
        Banned word patterns and their reasons. Each pattern is categorized
        by detection type and scoped to content, filename, or directory rules.
      </p>
      {allPatterns.length === 0 ? (
        <p className="empty-state">
          No patterns found. Check that the banned words configuration is
          accessible at WORKSPACE_CI_CONFIG_ROOT.
        </p>
      ) : (
        <PatternList patterns={allPatterns} />
      )}
    </WikiShell>
  )
}
