import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/lib/auth-middleware", () => ({
  authenticateCron: vi.fn(),
  authErrorResponse: vi.fn().mockReturnValue({ body: { error: "auth error" }, status: 401 }),
}));

vi.mock("@/lib/jobs/job-registry", () => ({
  getJobEntry: vi.fn(),
}));

vi.mock("@/lib/automation/workers/registry", () => ({
  WorkerRegistry: {},
}));

vi.mock("@/lib/logger", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { GET } from "../app/api/workers/job-processor/route";
import { authenticateCron } from "@/lib/auth-middleware";
import { getJobEntry } from "@/lib/jobs/job-registry";
import { WorkerRegistry } from "@/lib/automation/workers/registry";
import { log } from "@/lib/logger";

describe("Job Processor Route", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock supabase client
    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    vi.mocked(authenticateCron).mockResolvedValue({ supabaseAdmin: mockSupabase });
  });

  it("returns 0 processed if no jobs claimed", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

    const request = new Request("http://localhost/api/workers/job-processor");
    const response = await GET(request);
    const json = await response.json();

    expect(authenticateCron).toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("claim_jobs", {
      batch_size: 5,
      worker_name: "web-job-processor",
      lock_timeout_seconds: 300,
    });
    expect(json.processed).toBe(0);
    expect(json.message).toBe("No pending jobs.");
  });

  it("fails immediately if job type is unknown", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          id: "job-1",
          job_type: "unknown_type",
          user_id: "user-1",
          workspace_id: "workspace-1",
          attempts: 0,
          max_attempts: 3,
        },
      ],
      error: null,
    });
    
    (getJobEntry as any).mockReturnValue(undefined);
    delete WorkerRegistry["unknown_type"];

    const request = new Request("http://localhost/api/workers/job-processor");
    const response = await GET(request);
    const json = await response.json();

    expect(json.processed).toBe(1);
    expect(json.results[0].status).toBe("failed");
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
    }));
  });

  it("processes a BI job successfully", async () => {
    const mockHandler = vi.fn().mockResolvedValue({ output: { success: true }, summary: "Done" });
    (getJobEntry as any).mockReturnValue({
      handler: mockHandler,
    });

    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          id: "bi-job-1",
          job_type: "bi_analysis",
          user_id: "user-1",
          workspace_id: "workspace-1",
          payload: { target: "xyz" },
          attempts: 0,
          max_attempts: 3,
        },
      ],
      error: null,
    });

    const request = new Request("http://localhost/api/workers/job-processor");
    const response = await GET(request);
    const json = await response.json();

    expect(mockHandler).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "bi-job-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      payload: { target: "xyz" },
    }));

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      result: { success: true },
      attempts: 1,
    }));
    
    expect(json.processed).toBe(1);
    expect(json.results[0].status).toBe("completed");
  });

  it("persists a durable continuation without completing the job", async () => {
    const mockHandler = vi.fn().mockResolvedValue({
      output: {},
      summary: "Amazon report is processing",
      continuation: {
        payload: { phase: "poll", reportId: "report-123" },
        delaySeconds: 30,
        progress: 25,
        summary: "Waiting for Amazon report",
      },
    });
    (getJobEntry as any).mockReturnValue({ handler: mockHandler });
    mockSupabase.rpc.mockResolvedValue({
      data: [{
        id: "continuation-job",
        job_type: "amazon_ads_sync",
        user_id: "user-1",
        workspace_id: "workspace-1",
        payload: { phase: "request" },
        attempts: 0,
        max_attempts: 3,
      }],
      error: null,
    });

    const before = Date.now();
    const response = await GET(new Request("http://localhost/api/workers/job-processor"));
    const json = await response.json();

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "waiting",
      payload: { phase: "poll", reportId: "report-123" },
      progress: 25,
      result: { summary: "Waiting for Amazon report" },
      locked_by: null,
      locked_until: null,
    }));
    const update = mockSupabase.update.mock.calls[0][0];
    expect(new Date(update.run_at).getTime()).toBeGreaterThanOrEqual(before + 29_000);
    expect(json.results).toEqual([{
      jobId: "continuation-job",
      status: "waiting",
      jobType: "amazon_ads_sync",
    }]);
  });

  it("processes an Event Worker job successfully", async () => {
    const mockProcessJob = vi.fn().mockResolvedValue(undefined);
    WorkerRegistry["sync_worker"] = {
      name: "sync_worker",
      processJob: mockProcessJob
    };
    (getJobEntry as any).mockReturnValue(undefined);

    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          id: "event-job-1",
          job_type: "sync_worker",
          user_id: "user-1",
          workspace_id: "workspace-1",
          payload: { event_type: "schedule.daily.triggered" },
          attempts: 0,
          max_attempts: 3,
        },
      ],
      error: null,
    });

    const request = new Request("http://localhost/api/workers/job-processor");
    const response = await GET(request);
    const json = await response.json();

    expect(mockProcessJob).toHaveBeenCalledWith({ event_type: "schedule.daily.triggered" });
    
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      attempts: 1,
    }));
    
    expect(json.processed).toBe(1);
    expect(json.results[0].status).toBe("completed");
  });

  it("handles handler failure with exponential backoff retry", async () => {
    const mockHandler = vi.fn().mockRejectedValue(new Error("Transient error"));
    (getJobEntry as any).mockReturnValue({
      handler: mockHandler,
    });

    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          id: "retry-job",
          job_type: "bi_analysis",
          user_id: "user-1",
          workspace_id: "workspace-1",
          payload: {},
          attempts: 0, // 0 attempts -> will be 1st attempt, should retry
          max_attempts: 3,
        },
      ],
      error: null,
    });

    const request = new Request("http://localhost/api/workers/job-processor");
    const response = await GET(request);
    const json = await response.json();

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "retrying",
      attempts: 1,
    }));
    // Also should append to error log, but we can't easily mock that precise object here since we use `expect.objectContaining`
    
    expect(json.processed).toBe(1);
    expect(json.results[0].status).toBe("requeued");
  });

  it("dead-letters a job after max attempts", async () => {
    const mockHandler = vi.fn().mockRejectedValue(new Error("Persistent error"));
    (getJobEntry as any).mockReturnValue({
      handler: mockHandler,
    });

    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          id: "dead-job",
          job_type: "bi_analysis",
          user_id: "user-1",
          workspace_id: "workspace-1",
          payload: {},
          attempts: 2, // It's going to be the 3rd attempt, max is 3
          max_attempts: 3,
        },
      ],
      error: null,
    });

    const request = new Request("http://localhost/api/workers/job-processor");
    const response = await GET(request);
    const json = await response.json();

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      attempts: 3,
    }));
    
    expect(json.processed).toBe(1);
    expect(json.results[0].status).toBe("failed");
  });
});
