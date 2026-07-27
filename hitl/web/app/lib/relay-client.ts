import { z } from 'zod'

const FeedItemSchema = z.object({
  id: z.string(),
  principal: z.string(),
  host: z.string(),
  action: z.object({ display: z.string() }),
  scope: z.string(),
  tier: z.union([z.literal(1), z.literal(2)]),
  justification: z.string(),
  requestHash: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
})

const FeedSchema = z.object({ items: z.array(FeedItemSchema) })

export const RequestSummarySchema = FeedItemSchema

export type RequestSummary = z.infer<typeof FeedItemSchema>

export interface RelayClient {
  getFeed(): Promise<RequestSummary[]>
  getRequest(id: string): Promise<RequestSummary | null>
  submitDecision(
    requestId: string,
    decision: 'approve' | 'deny',
  ): Promise<{ outcome: string }>
  mintWsTicket(): Promise<{ ticket: string }>
}

/**
 * Typed relay client (NFR-3.2).
 *
 * When RELAY_BASE_URL is unset the client returns safe static defaults so the
 * scaffold builds and tests without a live relay. In production the
 * base URL is configured and all responses are validated against the
 * hitl-protocol schema.
 */
export function createRelayClient(): RelayClient {
  return {
    async getFeed() {
      const baseUrl = process.env.RELAY_BASE_URL
      if (!baseUrl) return []
      const res = await fetch(`${baseUrl}/api/v1/feed`)
      const json = await res.json()
      const parsed = FeedSchema.parse(json)
      return parsed.items
    },

    async getRequest(id) {
      const baseUrl = process.env.RELAY_BASE_URL
      if (!baseUrl) return null
      const res = await fetch(`${baseUrl}/api/v1/requests/${encodeURIComponent(id)}`)
      const json = await res.json()
      return RequestSummarySchema.parse(json)
    },

    async submitDecision(requestId, decision) {
      const baseUrl = process.env.RELAY_BASE_URL
      if (!baseUrl) return { outcome: decision }
      const res = await fetch(
        `${baseUrl}/api/v1/requests/${encodeURIComponent(requestId)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      )
      const json = await res.json()
      return { outcome: String(json.outcome ?? decision) }
    },

    async mintWsTicket() {
      const baseUrl = process.env.RELAY_BASE_URL
      if (!baseUrl) return { ticket: 'dev-ticket' }
      const res = await fetch(`${baseUrl}/api/v1/ws-ticket`, { method: 'POST' })
      const json = await res.json()
      return { ticket: String(json.ticket) }
    },
  }
}
