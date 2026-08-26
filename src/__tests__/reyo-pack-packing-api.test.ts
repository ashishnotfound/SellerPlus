import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-middleware", () => ({
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
  authErrorResponse: vi.fn(() => ({
    body: { error: "The request could not be completed.", code: "INTERNAL_ERROR" },
    status: 500,
  })),
}));

import { POST as scan } from "@/app/api/reyo-pack/scan/route";
import { POST as pack } from "@/app/api/reyo-pack/pack/route";
import { GET as queue } from "@/app/api/reyo-pack/queue/route";
import { authenticate, requirePermission } from "@/lib/auth-middleware";

const workspaceId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const shipmentId = "40000000-0000-4000-8000-000000000001";

describe("Reyo Pack packing API workflow", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate).mockResolvedValue({
      userId,
      workspaceId,
      permissions: ["reyo_pack.read", "reyo_pack.pack"],
      supabaseAdmin: { rpc },
    } as never);
  });

  it("resolves BARCODE -> AWB -> SHIPMENT -> ORDER through the atomic scan RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: "ORDER_FOUND",
        orderId: "50000000-0000-4000-8000-000000000001",
        amazonOrderId: "404-1234567-1234567",
        shipmentId,
        awb: "371317811994",
        packingStatus: "PACKING",
        labelAvailable: false,
        claimExpiresAt: "2026-08-26T08:30:00.000Z",
        items: [{ sku: "POSTER-8X12", title: "Spider-Man Poster", quantity: 1 }],
      },
      error: null,
    });
    const response = await scan(new Request("http://localhost/api/reyo-pack/scan", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        barcode: "371317811994",
        idempotencyKey: "scan:device-1:0001",
        source: "CAMERA",
      }),
    }));

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "reyo_pack.pack");
    expect(rpc).toHaveBeenCalledWith("claim_reyo_pack_shipment", {
      p_workspace_id: workspaceId,
      p_actor_id: userId,
      p_session_id: sessionId,
      p_barcode: "371317811994",
      p_idempotency_key: "scan:device-1:0001",
      p_marketplace_account_id: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { outcome: "ORDER_FOUND", shipmentId, awb: "371317811994" },
    });
  });

  it("confirms packing only through the atomic confirmation RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: "PACKED",
        orderId: "50000000-0000-4000-8000-000000000001",
        amazonOrderId: "404-1234567-1234567",
        shipmentId,
        awb: "371317811994",
        packedAt: "2026-08-26T08:30:00.000Z",
        unitsPacked: 1,
        items: [{ sku: "POSTER-8X12", quantity: 1 }],
      },
      error: null,
    });
    const response = await pack(new Request("http://localhost/api/reyo-pack/pack", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        shipmentId,
        idempotencyKey: "pack:device-1:0001",
      }),
    }));

    expect(rpc).toHaveBeenCalledWith("confirm_reyo_pack_shipment", {
      p_workspace_id: workspaceId,
      p_actor_id: userId,
      p_session_id: sessionId,
      p_shipment_id: shipmentId,
      p_idempotency_key: "pack:device-1:0001",
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { outcome: "PACKED", shipmentId, unitsPacked: 1 },
    });
  });

  it("rejects an invalid RPC payload instead of returning fake packing success", async () => {
    rpc.mockResolvedValue({ data: { outcome: "PACKED" }, error: null });
    const response = await pack(new Request("http://localhost/api/reyo-pack/pack", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        shipmentId,
        idempotencyKey: "pack:device-1:0002",
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("keeps queue reads tenant-scoped and bounded", async () => {
    rpc.mockResolvedValue({ data: { rows: [], total: 384 }, error: null });
    const response = await queue(new Request(
      "http://localhost/api/reyo-pack/queue?status=UNPACKED&sort=priority&direction=desc&page=2&limit=50",
    ));

    expect(rpc).toHaveBeenCalledWith("get_reyo_pack_queue_page", {
      p_workspace_id: workspaceId,
      p_status: "UNPACKED",
      p_search: null,
      p_sort: "priority",
      p_ascending: false,
      p_limit: 50,
      p_offset: 50,
    });
    await expect(response.json()).resolves.toMatchObject({
      pagination: { page: 2, limit: 50, total: 384 },
    });
  });
});
