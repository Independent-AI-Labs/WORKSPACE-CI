export interface RequestSummary {
  id: string
  principal: string
  host: string
  action: { display: string }
  scope: string
  tier: 1 | 2
  justification: string
  requestHash: string
  createdAt: string
  expiresAt: string
}
