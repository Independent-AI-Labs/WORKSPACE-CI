import { WikiShell } from '@/components/wiki/WikiShell'
import { ContentRenderer } from '@/components/wiki/ContentRenderer'
import { getDocsRoot } from '@/lib/yaml-loader'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const revalidate = 3600

export default async function IntegrationPage() {
  const filePath = join(getDocsRoot(), 'HOOKS.md')
  let content: string
  try {
    content = await readFile(filePath, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    console.error('Integration documentation file not found:', filePath)
    throw new Error('Integration documentation is currently unavailable')
  }

  return (
    <WikiShell>
      <ContentRenderer content={content} />
    </WikiShell>
  )
}
