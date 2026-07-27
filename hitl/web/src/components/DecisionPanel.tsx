'use client'

import { useState } from 'react'
import { Button } from '@workspace-ci/web-components/components/Button'
import { TierBadge } from './TierBadge'

export function DecisionPanel({
  requestId,
  tier,
}: {
  requestId: string
  tier: 1 | 2
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function submit(decision: 'approve' | 'deny') {
    setBusy(true)
    try {
      const response = await fetch('/api/hitl/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, decision }),
      })
      const data = (await response.json()) as { outcome?: string }
      setResult(data.outcome ?? 'recorded')
    } catch {
      setResult('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="decision-panel">
      {tier === 2 && <TierBadge tier={2} />}
      <Button
        onClick={() => submit('approve')}
        loading={busy}
        disabled={busy}
      >
        Approve
      </Button>
      <Button
        variant="danger"
        onClick={() => submit('deny')}
        loading={busy}
        disabled={busy}
      >
        Deny
      </Button>
      {result && (
        <p className="decision-result" aria-live="polite">
          {result}
        </p>
      )}
    </div>
  )
}
