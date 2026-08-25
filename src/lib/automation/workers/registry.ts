import { z } from "zod";
import type { Worker } from "./base-worker";
import { getAdminClient } from "@/lib/supabase/admin";
import { jobService } from "@/lib/jobs/job-service";

const optimizationRequestSchema = z.object({
  target: z.enum(["ads", "inventory", "pricing"]),
  context: z.record(z.unknown()).default({}),
});

const recommendationSchema = z.object({
  recommendation_id: z.string().uuid(),
  action_type: z.string().min(1),
});

function requireTenant(event: Parameters<Worker["processJob"]>[0]) {
  if (!event.user_id || !event.workspace_id) {
    throw new Error("The event is missing its tenant or user owner.");
  }
  return { userId: event.user_id, workspaceId: event.workspace_id };
}

export const AIWorker: Worker = {
  name: "ai_worker",
  processJob: async (event) => {
    if (event.event_type !== "ai.optimization.requested") {
      throw new Error(`AI worker does not support event type ${event.event_type}.`);
    }

    const owner = requireTenant(event);
    const request = optimizationRequestSchema.parse(event.payload);
    const jobType = request.target === "ads" ? "audit_ads" : "bi_analysis";
    const goal = request.target === "inventory"
      ? "PREVENT_STOCKOUT"
      : request.target === "pricing"
        ? "MAXIMIZE_PROFIT"
        : "REDUCE_ACOS";

    await jobService.enqueue({
      type: jobType,
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      payload: {
        mode: request.target === "ads" ? "Advertising Audit" : "Store Audit",
        goal,
        sourceEventId: event.id,
        requestContext: request.context,
      },
      priority: 3,
      maxAttempts: 3,
      idempotencyKey: `ai-optimization:${event.id}`,
    });
  },
};

export const AutomationWorker: Worker = {
  name: "automation_worker",
  processJob: async (event) => {
    if (event.event_type !== "ai.recommendation_generated") {
      throw new Error(`Automation worker does not support event type ${event.event_type}.`);
    }

    const owner = requireTenant(event);
    const recommendation = recommendationSchema.parse(event.payload);
    const admin = getAdminClient();
    const { data: proposal, error } = await admin
      .from("action_proposals")
      .select("id, status, action_type")
      .eq("id", recommendation.recommendation_id)
      .eq("workspace_id", owner.workspaceId)
      .maybeSingle();

    if (error) throw error;
    if (!proposal) throw new Error("The referenced action proposal does not exist in this workspace.");
    if (proposal.status !== "approved") return;

    // External mutations must have a deterministic executor registered for the
    // action type. Until that executor exists, fail closed instead of reporting
    // a successful marketplace or advertising change.
    throw new Error(`No deterministic executor is registered for ${proposal.action_type}.`);
  },
};

export const NotificationWorker: Worker = {
  name: "notification_worker",
  processJob: async (event) => {
    const owner = requireTenant(event);
    const admin = getAdminClient();
    let title: string;
    let content: string;

    if (event.event_type === "ai.recommendation_generated") {
      const recommendation = recommendationSchema.parse(event.payload);
      title = "AI action ready for review";
      content = `Review the proposed ${recommendation.action_type} action before execution.`;
    } else if (event.event_type === "report.generated") {
      const report = z.object({ summary: z.string().min(1) }).parse(event.payload);
      title = "SellerPlus report ready";
      content = report.summary;
    } else {
      throw new Error(`Notification worker does not support event type ${event.event_type}.`);
    }

    const { error } = await admin.from("notifications").insert({
      workspace_id: owner.workspaceId,
      user_id: owner.userId,
      channel: "in-app",
      title,
      content,
    });
    if (error) throw error;
  },
};

export const ReportWorker: Worker = {
  name: "report_worker",
  processJob: async (event) => {
    if (event.event_type !== "sync.completed") {
      throw new Error(`Report worker does not support event type ${event.event_type}.`);
    }
    const owner = requireTenant(event);

    await jobService.enqueue({
      type: "generate_report",
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      payload: { sourceEventId: event.id, sync: event.payload },
      priority: 5,
      maxAttempts: 2,
      idempotencyKey: `report-for-sync:${event.id}`,
    });
  },
};

export const SyncWorker: Worker = {
  name: "sync_worker",
  processJob: async (event) => {
    requireTenant(event);
    if (event.event_type !== "schedule.daily.triggered") {
      throw new Error(`Sync worker does not support event type ${event.event_type}.`);
    }
    throw new Error(
      "Scheduled Amazon sync requires a credential-backed marketplace account and a registered incremental sync handler.",
    );
  },
};

export const WarehouseWorker: Worker = {
  name: "warehouse_worker",
  processJob: async (event) => {
    requireTenant(event);
    if (event.event_type !== "order.created") {
      throw new Error(`Warehouse worker does not support event type ${event.event_type}.`);
    }
    throw new Error("No warehouse allocation policy is configured for this workspace.");
  },
};

export const WorkerRegistry: Record<string, Worker> = {
  ai_worker: AIWorker,
  automation_worker: AutomationWorker,
  notification_worker: NotificationWorker,
  report_worker: ReportWorker,
  sync_worker: SyncWorker,
  warehouse_worker: WarehouseWorker,
};
