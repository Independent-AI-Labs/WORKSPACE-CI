import { WikiShell } from '@/components/wiki/WikiShell'
import { PlaygroundShell } from '@/components/wiki/playground/PlaygroundShell'
import { getBannedPatterns } from '@/lib/yaml-loader'
import { classifyAll } from '@/lib/patterns'

export default async function PlaygroundPage() {
  const config = await getBannedPatterns()
  const all = classifyAll(config)
  const playable = all.filter((p) => p.scope !== 'filename')

  return (
    <WikiShell>
      <h1>Playground</h1>
      <p className="page-intro">
        Test banned word patterns against live code samples. Select a
        language, choose pattern categories, and see matches highlighted
        in real time.
      </p>
      <PlaygroundShell patterns={playable} />
    </WikiShell>
  )
}
