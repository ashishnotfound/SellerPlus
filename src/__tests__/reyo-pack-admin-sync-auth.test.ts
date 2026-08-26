import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-middleware", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-middleware")>();
  return { ...actual, authenticate: vi.fn() };
});

vi.mock("@/lib/amazon/credentials", () => ({
  getAmazonMarketplaceAccount: vi.fn(),
}));

import { POST } from "@/app/api/reyo-pack/admin/amazon/sync/route";
import { authenticate } from "@/lib/auth-middleware";
import { getAmazonMarketplaceAccount } from "@/lib/amazon/credentials";
import { rolePermissions } from "@/lib/security/permissions";

function actor(role: "member" | "admin", supabaseAdmin: unknown) {
  return {
    userId: "10000000-0000-4000-8000-000000000001",
    email: "worker@example.com",
    profileRole: role,
    isSuperAdmin: false,
    workspaceId: "20000000-0000-4000-8000-000000000001",
    workspaceRole: role,
    permissions: rolePermissions[role],
    supabaseAdmin,
  } as never;
}

function request(): Request {
  return new Request("http://localhost/api/reyo-pack/admin/amazon/sync", {
    method: "POST",
    body: JSON.stringify({ action: "SYNC_NOW" }),
  });
}

describe("Reyo Pack admin Amazon synchronization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies a packing worker before reading account credentials or queueing work", async () => {
    vi.mocked(authenticate).mockResolvedValue(actor("member", {}));

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
    expect(getAmazonMarketplaceAccount).not.toHaveBeenCalled();
  });

  it("queues an authorized manual sync through one atomic database function", async () => {
    const checkpointQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    checkpointQuery.select = vi.fn(() => checkpointQuery);
    checkpointQuery.eq = vi.fn(() => checkpointQuery);
    checkpointQuery.maybeSingle = vi.fn().mockResolvedValue({
      data: { cursor: { lastUpdatedAfter: "2026-08-25T00:00:00.000Z" } },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        syncRunId: "30000000-0000-4000-8000-000000000001",
        jobId: "40000000-0000-4000-8000-000000000001",
        syncType: "INCREMENTAL",
        status: "QUEUED",
        reused: false,
      },
      error: null,
    });
    const supabaseAdmin = {
      from: vi.fn(() => checkpointQuery),
      rpc,
    };
    vi.mocked(authenticate).mockResolvedValue(actor("admin", supabaseAdmin));
    vi.mocked(getAmazonMarketplaceAccount).mockResolvedValue({
      id: "50000000-0000-4000-8000-000000000001",
      workspaceId: "20000000-0000-4000-8000-000000000001",
      region: "Europe",
      marketplaceId: "A21TJRUUN4KGV",
      sellerAccountId: "seller-1",
      displayName: "Reyo Store",
      status: "active",
      capabilities: ["selling_partner"],
      metadata: {},
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("enqueue_reyo_pack_sync", expect.objectContaining({
      p_workspace_id: "20000000-0000-4000-8000-000000000001",
      p_marketplace_account_id: "50000000-0000-4000-8000-000000000001",
      p_actor_id: "10000000-0000-4000-8000-000000000001",
      p_sync_type: "INCREMENTAL",
      p_updated_after: "2026-08-25T00:00:00.000Z",
      p_updated_before: expect.any(String),
      p_correlation_id: expect.any(String),
    }));
  });
});
