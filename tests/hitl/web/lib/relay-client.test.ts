import { createRelayClient } from "../../../../hitl/web/app/lib/relay-client";

describe("relay-client", () => {
  const originalRelayBaseUrl = process.env.RELAY_BASE_URL;

  afterEach(() => {
    if (originalRelayBaseUrl === undefined) delete process.env.RELAY_BASE_URL;
    else process.env.RELAY_BASE_URL = originalRelayBaseUrl;
    vi.restoreAllMocks();
  });

  it("fails closed when the relay is not configured", async () => {
    delete process.env.RELAY_BASE_URL;
    const client = createRelayClient();

    await expect(client.getFeed()).rejects.toThrow(
      "HITL relay is not configured",
    );
    await expect(client.getRequest("request-1")).rejects.toThrow(
      "HITL relay is not configured",
    );
    await expect(client.submitDecision("request-1", "approve")).rejects.toThrow(
      "HITL relay is not configured",
    );
    await expect(client.mintWsTicket()).rejects.toThrow(
      "HITL relay is not configured",
    );
  });

  it("rejects unsuccessful relay responses", async () => {
    process.env.RELAY_BASE_URL = "https://relay.example";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(createRelayClient().getFeed()).rejects.toThrow(
      "HITL relay request failed: 503",
    );
  });
});
