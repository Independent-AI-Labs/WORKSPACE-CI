import { WikiShell } from '@/components/wiki/WikiShell'
import { CheckList } from '@/components/wiki/CheckCard'
import { loadApiDocs, loadShellDocs } from '@/lib/docs-loader'

export default async function ChecksPage() {
  const apiDocs = loadApiDocs()
  const shellDocs = loadShellDocs()

  return (
    <WikiShell>
      <h1>Check Catalog</h1>
      {apiDocs || shellDocs ? (
        <CheckList apiDocs={apiDocs} shellDocs={shellDocs} />
      ) : (
        <p className="empty-state">
          No check documentation available. Run the extraction pipeline
          to generate api-docs.json and shell-docs.json.
        </p>
      )}
    </WikiShell>
  )
}
