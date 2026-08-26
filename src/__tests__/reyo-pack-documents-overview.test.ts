import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-middleware", () => ({
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
  authErrorResponse: vi.fn(() => ({
    body: { error: "The request could not be completed.", code: "INTERNAL_ERROR" },
    status: 500,
  })),
}));

import { GET as getLabel } from "@/app/api/reyo-pack/labels/[shipmentId]/route";
import { GET as getOverview } from "@/app/api/reyo-pack/admin/overview/route";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import {
  LabelDocumentError,
  loadReyoPackLabel,
  type ReyoPackLabelDocument,
} from "@/lib/reyo-pack/label-documents";

const workspaceId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const shipmentId = "30000000-0000-4000-8000-000000000001";
const documentId = "40000000-0000-4000-8000-000000000001";

const baseDocument: ReyoPackLabelDocument = {
  id: documentId,
  shipment_id: shipmentId,
  external_document_reference: null,
  storage_bucket: "private-labels",
  storage_path: `${workspaceId}/${shipmentId}.pdf`,
  content_type: "application/pdf",
  document_source: "AMAZON_EASY_SHIP",
  external_expires_at: null,
};

describe("Reyo Pack label documents", () => {
  it("loads private storage without exposing its bucket or object path", async () => {
    const download = vi.fn().mockResolvedValue({
      data: new Blob(["%PDF-secure-label"], { type: "application/pdf" }),
      error: null,
    });
    const result = await loadReyoPackLabel(baseDocument, {
      from: vi.fn(() => ({ download })),
    });

    expect(new TextDecoder().decode(result.bytes)).toBe("%PDF-secure-label");
    expect(result).toMatchObject({ contentType: "application/pdf", inline: true, extension: "pdf" });
    expect(download).toHaveBeenCalledWith(`${workspaceId}/${shipmentId}.pdf`);
  });

  it("rejects expired and non-Amazon external references before fetching", async () => {
    const fetcher = vi.fn();
    const external = {
      ...baseDocument,
      storage_bucket: null,
      storage_path: null,
      external_document_reference: "https://127.0.0.1/internal-label",
      external_expires_at: "2026-08-27T00:00:00.000Z",
    };
    await expect(loadReyoPackLabel(
      external,
      { from: vi.fn() },
      fetcher,
      new Date("2026-08-26T00:00:00.000Z"),
    )).rejects.toMatchObject({ code: "LABEL_REFERENCE_REJECTED", status: 409 });
    expect(fetcher).not.toHaveBeenCalled();

    await expect(loadReyoPackLabel(
      { ...external, external_document_reference: "https://labels.amazonaws.com/file", external_expires_at: "2026-08-25T00:00:00.000Z" },
      { from: vi.fn() },
      fetcher,
      new Date("2026-08-26T00:00:00.000Z"),
    )).rejects.toMatchObject({ code: "LABEL_EXPIRED", status: 409 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("streams an authorized label and records document access", async () => {
    const labelQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: baseDocument, error: null }),
    };
    labelQuery.select.mockReturnValue(labelQuery);
    labelQuery.eq.mockReturnValue(labelQuery);
    const insert = vi.fn().mockResolvedValue({ error: null });
    const download = vi.fn().mockResolvedValue({
      data: new Blob(["%PDF-route-label"], { type: "application/pdf" }),
      error: null,
    });
    vi.mocked(authenticate).mockResolvedValue({
      userId,
      workspaceId,
      permissions: ["reyo_pack.read"],
      supabaseAdmin: {
        from: vi.fn((table: string) => table === "reyo_pack_label_documents"
          ? labelQuery
          : { insert }),
        storage: { from: vi.fn(() => ({ download })) },
      },
    } as never);

    const response = await getLabel(
      new Request(`http://localhost/api/reyo-pack/labels/${shipmentId}`),
      { params: Promise.resolve({ shipmentId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(`amazon-label-${shipmentId}.pdf`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("%PDF-route-label");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: workspaceId,
      action: "reyo_pack.label_viewed",
      resource_id: shipmentId,
    }));
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "reyo_pack.read");
  });
});

describe("Reyo Pack admin overview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only the database-computed workspace snapshot", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        generatedAt: "2026-08-26T10:00:00.000Z",
        windowStart: "2026-08-26T00:00:00.000Z",
        todayOrders: 84,
        unpackedOrders: 19,
        packedOrders: 64,
        cancelledOrders: 1,
        currentSessions: 2,
        currentPackingSessions: 1,
        currentPutawaySessions: 1,
        packagesPacked: 65,
        unitsPacked: 72,
        putawayActions: 18,
      },
      error: null,
    });
    vi.mocked(authenticate).mockResolvedValue({
      userId,
      workspaceId,
      permissions: ["reyo_pack.admin"],
      supabaseAdmin: { rpc },
    } as never);

    const response = await getOverview(new Request("http://localhost/api/reyo-pack/admin/overview"));

    expect(rpc).toHaveBeenCalledWith("get_reyo_pack_admin_overview", {
      p_workspace_id: workspaceId,
    });
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "reyo_pack.admin");
    await expect(response.json()).resolves.toMatchObject({
      data: { todayOrders: 84, packagesPacked: 65, unitsPacked: 72 },
    });
  });
});
