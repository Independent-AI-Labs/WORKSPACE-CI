import { z } from "zod";

const FeedItemSchema = z.object({
  id: z.string(),
  principal: z.string(),
  host: z.string(),
  action: z.object({ display: z.string(), cwd: z.string() }),
  scope: z.string(),
  justification: z.string(),
  requestHash: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  state: z.enum(["pending", "approved", "denied", "expired", "cancelled"]),
});

const FeedSchema = z.object({ items: z.array(FeedItemSchema) });

export const RequestSummarySchema = FeedItemSchema;

export type RequestSummary = z.infer<typeof FeedItemSchema>;

export interface RelayClient {
  getFeed(): Promise<RequestSummary[]>;
  getRequest(id: string): Promise<RequestSummary | null>;
  submitDecision(
    requestId: string,
    requestHash: string,
    decision: "approve" | "deny",
  ): Promise<{ outcome: string }>;
  mintWsTicket(): Promise<{ ticket: string }>;
}

function relayBaseUrl(): string {
  const baseUrl = process.env.RELAY_BASE_URL;
  if (!baseUrl) throw new Error("HITL relay is not configured");
  return baseUrl;
}

async function relayJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok)
    throw new Error(`HITL relay request failed: ${response.status}`);
  return response.json();
}

export function createRelayClient(): RelayClient {
  return {
    async getFeed() {
      const json = await relayJson(`${relayBaseUrl()}/api/v1/feed`);
      const parsed = FeedSchema.parse(json);
      return parsed.items;
    },

    async getRequest(id) {
      const json = await relayJson(
        `${relayBaseUrl()}/api/v1/requests/${encodeURIComponent(id)}`,
      );
      return RequestSummarySchema.parse(json);
    },

    async submitDecision(requestId, requestHash, decision) {
      const json = await relayJson(
        `${relayBaseUrl()}/api/v1/requests/${encodeURIComponent(requestId)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, request_hash: requestHash }),
        },
      );
      if (
        !json ||
        typeof json !== "object" ||
        typeof (json as { outcome?: unknown }).outcome !== "string"
      ) {
        throw new Error("HITL relay returned an invalid decision outcome");
      }
      return { outcome: (json as { outcome: string }).outcome };
    },

    async mintWsTicket() {
      const json = await relayJson(`${relayBaseUrl()}/api/v1/ws-ticket`, {
        method: "POST",
      });
      if (
        !json ||
        typeof json !== "object" ||
        typeof (json as { ticket?: unknown }).ticket !== "string"
      ) {
        throw new Error("HITL relay returned an invalid websocket ticket");
      }
      return { ticket: (json as { ticket: string }).ticket };
    },
  };
}
