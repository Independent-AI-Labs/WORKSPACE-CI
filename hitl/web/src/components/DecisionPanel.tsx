'use client'

import { useState } from 'react'
import { Button } from '@workspace-ci/web-components/components/Button'

export function DecisionPanel({
  requestId,
  requestHash,
  disabled = false,
}: {
  requestId: string
  requestHash: string
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function submit(decision: 'approve' | 'deny') {
    setBusy(true)
    try {
      const response = await fetch('/api/hitl/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, request_hash: requestHash, decision }),
      })
      const data = (await response.json()) as { outcome?: string }
      if (typeof data.outcome !== 'string' || data.outcome.length === 0) {
        setResult('error: missing outcome from server')
        return
      }
      setResult(data.outcome)
    } catch {
      setResult('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="decision-panel">
      <Button
        onClick={() => submit('approve')}
        loading={busy}
        disabled={busy || disabled}
      >
        Approve
      </Button>
      <Button
        variant="danger"
        onClick={() => submit('deny')}
        loading={busy}
        disabled={busy || disabled}
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
