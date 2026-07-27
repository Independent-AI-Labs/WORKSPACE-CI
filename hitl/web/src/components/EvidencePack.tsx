'use client'

import { RequestSummary } from '@/types/request'
import { TierBadge } from './TierBadge'

export function EvidencePack({ request }: { request: RequestSummary }) {
  return (
    <section className="evidence-pack" aria-label="Request evidence">
      <div className="evidence-row">
        <span className="evidence-label">Agent</span>
        <code className="evidence-value">{request.principal}</code>
      </div>
      <div className="evidence-row">
        <span className="evidence-label">Host</span>
        <code className="evidence-value">{request.host}</code>
      </div>
      <div className="evidence-row">
        <span className="evidence-label">Action</span>
        <span className="evidence-value">{request.action.display}</span>
      </div>
      <div className="evidence-row">
        <span className="evidence-label">Scope</span>
        <span className="evidence-value">{request.scope}</span>
        <TierBadge tier={request.tier} />
      </div>
      <div className="evidence-row">
        <span className="evidence-label">Justification</span>
        <p className="evidence-value">{request.justification}</p>
      </div>
      <div className="evidence-row">
        <span className="evidence-label">Request hash</span>
        <code className="evidence-value">
          {request.requestHash.slice(0, 16)}…
        </code>
      </div>
    </section>
  )
}
