import { WikiShell } from '@/components/wiki/WikiShell'
import { CapabilityGauge } from '@/components/wiki/CapabilityGauge'
import { ContentRenderer } from '@workspace-ci/web-components/components/ContentRenderer'
import { getDocsRoot } from '@/lib/yaml-loader'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const revalidate = 3600

const SOURCE_REPO_URL = 'https://github.com/Independent-AI-Labs/WORKSPACE-CI'
const SOURCE_BRANCH = 'main'
const CAPABILITIES_MARKER = '<!-- workspace-capabilities -->'

export default async function IntegrationPage() {
  const filePath = join(getDocsRoot(), 'runbooks', 'RUNBOOK-INTEGRATION.md')
  let content: string
  try {
    content = await readFile(filePath, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    console.error('Integration documentation file not found:', filePath)
    throw new Error('Integration documentation is currently unavailable')
  }

  const linkContext = { repoUrl: SOURCE_REPO_URL, branch: SOURCE_BRANCH }
  const [before, after] = content.split(CAPABILITIES_MARKER)

  return (
    <WikiShell
      hero={{
        title: 'Integration Guide',
        subtitle: 'How the workspace stack enforces policy across code, agents, and AI traffic.',
        dynamic: true,
      }}
    >
      <ContentRenderer content={before} {...linkContext} />
      {after !== undefined && <CapabilityGauge />}
      {after !== undefined && <ContentRenderer content={after} {...linkContext} />}
    </WikiShell>
  )
}
