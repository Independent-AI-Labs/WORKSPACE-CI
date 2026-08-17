export interface RequestSummary {
  id: string
  principal: string
  host: string
  action: { display: string; cwd: string }
  scope: string
  justification: string
  requestHash: string
  createdAt: string
  expiresAt: string
  state: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled'
}
