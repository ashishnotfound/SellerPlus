import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-middleware", () => ({
  authenticateCron: vi.fn(),
  authErrorResponse: vi.fn((error: unknown) => ({
    body: { error: error instanceof Error ? error.message : "Request failed", code: "INTERNAL_ERROR" },
    status: 500,
  })),
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/workers/reyo-pack-scheduler/route";
import { authenticateCron } from "@/lib/auth-middleware";

describe("Reyo Pack Amazon sync scheduler", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateCron).mockResolvedValue({
      supabaseAdmin: { rpc } as never,
    });
  });

  it("uses the service-only atomic due-sync claim", async () => {
    rpc.mockResolvedValue({
      data: [{
        sync_run_id: "run-1",
        queued_job_id: "job-1",
        workspace_id: "workspace-1",
        marketplace_account_id: "account-1",
      }],
      error: null,
    });

    const response = await GET(new Request("http://localhost/api/workers/reyo-pack-scheduler", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(rpc).toHaveBeenCalledWith("enqueue_due_reyo_pack_syncs", { p_limit: 25 });
    await expect(response.json()).resolves.toMatchObject({
      enqueued: 1,
      syncs: [{ sync_run_id: "run-1", queued_job_id: "job-1" }],
    });
  });

  it("does not report success when the database claim fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("database unavailable") });

    const response = await GET(new Request("http://localhost/api/workers/reyo-pack-scheduler"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "database unavailable",
      code: "INTERNAL_ERROR",
    });
  });
});
