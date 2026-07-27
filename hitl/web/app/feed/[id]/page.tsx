import { createRelayClient } from '@/lib/relay-client'
import { EvidencePack } from '@/components/EvidencePack'
import { DecisionPanel } from '@/components/DecisionPanel'

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const client = createRelayClient()
  const request = await client.getRequest(id)

  if (!request) {
    return (
      <main className="hitl-feed">
        <h1 className="text-2xl font-semibold mb-4">Request not found</h1>
        <p>Either the request has expired or you do not have access.</p>
      </main>
    )
  }

  return (
    <main className="hitl-feed">
      <h1 className="text-2xl font-semibold mb-4">Request {id}</h1>
      <EvidencePack request={request} />
      <DecisionPanel requestId={request.id} tier={request.tier} />
    </main>
  )
}
