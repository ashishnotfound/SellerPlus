import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-middleware", () => ({
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
  authErrorResponse: vi.fn(() => ({
    body: { error: "The request could not be completed.", code: "INTERNAL_ERROR" },
    status: 500,
  })),
}));

import { POST as lookup } from "@/app/api/reyo-pack/putaway/lookup/route";
import { POST as confirm } from "@/app/api/reyo-pack/putaway/confirm/route";
import { POST as saveLocation } from "@/app/api/reyo-pack/admin/locations/route";
import { authenticate, requirePermission } from "@/lib/auth-middleware";

const workspaceId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const skuId = "40000000-0000-4000-8000-000000000001";
const locationId = "50000000-0000-4000-8000-000000000001";

describe("Reyo Pack putaway APIs", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate).mockResolvedValue({
      userId,
      workspaceId,
      permissions: ["reyo_pack.read", "reyo_pack.putaway", "reyo_pack.admin"],
      supabaseAdmin: { rpc },
    } as never);
  });

  it("looks up the authoritative location without recording completion", async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: "PRODUCT_FOUND",
        skuId,
        sku: "POSTER-8X12",
        productTitle: "Spider-Man Poster",
        locationId,
        locationCode: "B-04-12",
        locationName: "Bin 12",
        locationType: "BIN",
        assignmentVersion: 3,
      },
      error: null,
    });
    const response = await lookup(new Request("http://localhost/api/reyo-pack/putaway/lookup", {
      method: "POST",
      body: JSON.stringify({ sessionId, barcode: "8901234567890" }),
    }));

    expect(rpc).toHaveBeenCalledWith("lookup_reyo_putaway_product", {
      p_workspace_id: workspaceId,
      p_actor_id: userId,
      p_session_id: sessionId,
      p_barcode: "8901234567890",
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { outcome: "PRODUCT_FOUND", locationCode: "B-04-12", assignmentVersion: 3 },
    });
  });

  it("uses the scanned assignment version when DONE is confirmed", async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: "PUTAWAY_CONFIRMED",
        skuId,
        sku: "POSTER-8X12",
        locationId,
        locationCode: "B-04-12",
        quantity: 2,
        confirmedAt: "2026-08-26T09:00:00.000Z",
      },
      error: null,
    });
    const response = await confirm(new Request("http://localhost/api/reyo-pack/putaway/confirm", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        skuId,
        expectedLocationId: locationId,
        expectedAssignmentVersion: 3,
        quantity: 2,
        reason: "Morning print run",
        idempotencyKey: "putaway:device-1:0001",
      }),
    }));

    expect(rpc).toHaveBeenCalledWith("confirm_reyo_putaway_sku", expect.objectContaining({
      p_workspace_id: workspaceId,
      p_sku_id: skuId,
      p_expected_location_id: locationId,
      p_expected_assignment_version: 3,
      p_quantity: 2,
    }));
    await expect(response.json()).resolves.toMatchObject({
      data: { outcome: "PUTAWAY_CONFIRMED", quantity: 2 },
    });
  });

  it("routes location changes through the audited optimistic-lock function", async () => {
    rpc.mockResolvedValue({
      data: { locationId, code: "B-04-12", version: 1 },
      error: null,
    });
    const response = await saveLocation(new Request("http://localhost/api/reyo-pack/admin/locations", {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: 0,
        parentId: "60000000-0000-4000-8000-000000000001",
        type: "BIN",
        code: "B-04-12",
        name: "Bin 12",
        sortOrder: 12,
        active: true,
      }),
    }));

    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "reyo_pack.admin");
    expect(rpc).toHaveBeenCalledWith("save_reyo_pack_location", expect.objectContaining({
      p_workspace_id: workspaceId,
      p_location_id: null,
      p_expected_version: 0,
      p_location_type: "BIN",
      p_code: "B-04-12",
    }));
    expect(response.status).toBe(201);
  });
});
