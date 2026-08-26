import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/amazon/credentials", () => ({
  getAmazonMarketplaceAccount: vi.fn().mockResolvedValue({
    id: "50000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    region: "Europe",
    marketplaceId: "A21TJRUUN4KGV",
    sellerAccountId: "seller-1",
    displayName: "Reyo Store",
    status: "active",
    capabilities: ["selling_partner"],
    metadata: {},
  }),
  readAmazonCredentialSet: vi.fn().mockResolvedValue({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    applicationId: null,
  }),
  exchangeLwaRefreshToken: vi.fn().mockResolvedValue("access-token-with-sufficient-length"),
}));

import { runReyoPackAmazonSync } from "@/lib/amazon/reyo-pack-sync";

function supabase() {
  const syncRunQuery: Record<string, unknown> = { error: null };
  syncRunQuery.update = vi.fn(() => syncRunQuery);
  syncRunQuery.eq = vi.fn(() => syncRunQuery);

  const checkpointQuery: Record<string, unknown> = {};
  checkpointQuery.select = vi.fn(() => checkpointQuery);
  checkpointQuery.eq = vi.fn(() => checkpointQuery);
  checkpointQuery.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  checkpointQuery.upsert = vi.fn().mockResolvedValue({ error: null });

  const rpc = vi.fn().mockResolvedValue({ data: { status: "SUCCEEDED" }, error: null });
  return {
    client: {
      from: vi.fn((table: string) => table === "sync_checkpoints"
        ? checkpointQuery
        : syncRunQuery),
      rpc,
    },
    rpc,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    marketplaceAccountId: "50000000-0000-4000-8000-000000000001",
    syncRunId: "30000000-0000-4000-8000-000000000001",
    syncType: "INCREMENTAL",
    updatedAfter: "2026-08-20T00:00:00.000Z",
    updatedBefore: "2026-08-25T00:00:00.000Z",
    phase: "search",
    pendingOrders: [],
    pageCount: 0,
    started: false,
    counters: {
      scanned: 0,
      created: 0,
      updated: 0,
      cancelled: 0,
      shipmentsUpdated: 0,
      errors: 0,
    },
    ...overrides,
  };
}

function context(input: Record<string, unknown>, client: unknown) {
  return {
    jobId: "40000000-0000-4000-8000-000000000001",
    userId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    payload: input,
    supabaseAdmin: client,
    deadlineAt: Date.now() + 30_000,
    signal: new AbortController().signal,
  } as never;
}

describe("Reyo Pack durable Amazon synchronization", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("completes an empty incremental window through the atomic completion RPC", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ orders: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const db = supabase();

    const result = await runReyoPackAmazonSync(context(payload(), db.client));

    expect(result.output).toMatchObject({ status: "SUCCEEDED", ordersScanned: 0 });
    expect(db.rpc).toHaveBeenCalledWith("complete_reyo_pack_sync", {
      p_workspace_id: "20000000-0000-4000-8000-000000000001",
      p_sync_run_id: "30000000-0000-4000-8000-000000000001",
      p_updated_before: "2026-08-25T00:00:00.000Z",
      p_counters: expect.objectContaining({ scanned: 0, errors: 0 }),
      p_has_conflicts: false,
    });
  });

  it("persists Amazon pagination as a delayed continuation instead of holding the request open", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      orders: [],
      pagination: { nextToken: "amazon-next-page" },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-amzn-ratelimit-limit": "0.0056",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const db = supabase();

    const result = await runReyoPackAmazonSync(context(payload(), db.client));

    expect(result.continuation).toMatchObject({
      delaySeconds: 179,
      payload: {
        paginationToken: "amazon-next-page",
        pageCount: 1,
        started: true,
      },
    });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("includedData=CANCELLATION%2CFULFILLMENT%2CPACKAGES%2CPROCEEDS");
    expect(calledUrl).toContain("lastUpdatedAfter=2026-08-20T00%3A00%3A00.000Z");
    expect(db.rpc).not.toHaveBeenCalledWith("complete_reyo_pack_sync", expect.anything());
  });
});
