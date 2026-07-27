'use client'

import { RequestSummary } from '@/types/request'
import { EvidencePack } from './EvidencePack'
import { DecisionPanel } from './DecisionPanel'

export function FeedList({ items }: { items: RequestSummary[] }) {
  if (items.length === 0) {
    return <p className="hitl-empty">No pending requests.</p>
  }

  return (
    <ul className="hitl-feed-list" role="list">
      {items.map((item) => (
        <li key={item.id} className="hitl-feed-item">
          <EvidencePack request={item} />
          <DecisionPanel requestId={item.id} tier={item.tier} />
        </li>
      ))}
    </ul>
  )
}
