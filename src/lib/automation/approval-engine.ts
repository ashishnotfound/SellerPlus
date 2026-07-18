import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { emitEvent } from "./event-bus";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type ApprovalPolicy = "allow_automatically" | "require_approval" | "never_without_explicit_approval";

export interface EvaluationResult {
  status: "approved" | "pending_approval" | "rejected";
  workflowId?: string;
  reason?: string;
}

/**
 * ApprovalEngine
 * Evaluates whether an automated action can execute immediately or if it must be paused
 * and await human approval, based on the tenant's policies.
 */
export class ApprovalEngine {
  /**
   * Evaluate an action against user policies.
   */
  static async evaluateAction(
    userId: string,
    actionType: string,
    payload: any,
    correlationId: string
  ): Promise<EvaluationResult> {
    // 1. Fetch the user's policy for this action
    const { data: policyRecord, error: policyError } = await supabase
      .from("approval_policies")
      .select("policy, auto_approve_threshold")
      .eq("user_id", userId)
      .eq("action_type", actionType)
      .single();

    let policy: ApprovalPolicy = "require_approval"; // Default fallback (safe by default)
    let threshold = null;

    if (!policyError && policyRecord) {
      policy = policyRecord.policy as ApprovalPolicy;
      threshold = policyRecord.auto_approve_threshold;
    } else if (policyError && policyError.code !== "PGRST116") {
      // PGRST116 is "Rows not found". Other errors are real failures.
      console.error("Failed to fetch approval policy:", policyError);
      return { status: "pending_approval", reason: "System error: fallback to safe mode." };
    }

    // 2. Evaluate based on policy
    if (policy === "allow_automatically") {
      // Check threshold if applicable (e.g., allow automatic ad budget increases up to $500)
      if (threshold && payload.amount) {
        if (payload.amount > threshold.max_amount) {
          return await this.createPendingWorkflow(userId, actionType, payload, correlationId, "Threshold exceeded");
        }
      }
      return { status: "approved" };
    }

    if (policy === "never_without_explicit_approval") {
      return await this.createPendingWorkflow(userId, actionType, payload, correlationId, "Action requires explicit approval");
    }

    // default: require_approval
    return await this.createPendingWorkflow(userId, actionType, payload, correlationId, "Standard approval required");
  }

  /**
   * Creates a workflow in pending state so the user can approve it later.
   */
  private static async createPendingWorkflow(
    userId: string,
    actionType: string,
    payload: any,
    correlationId: string,
    reason: string
  ): Promise<EvaluationResult> {
    const workflowId = uuidv4();

    // Store the intent to execute
    const { error: insertError } = await supabase
      .from("workflow_state")
      .insert({
        id: workflowId,
        user_id: userId,
        workflow_type: `approval:${actionType}`,
        current_step: "awaiting_user_approval",
        state_data: { payload, reason },
        status: "pending_approval",
        correlation_id: correlationId,
      });

    if (insertError) {
      console.error("Failed to create pending workflow:", insertError);
      throw insertError;
    }

    // Since we don't have "approval_requested" strictly defined in the EventCatalog yet,
    // in a full implementation we would add it to event-catalog.ts and emit it here to notify the user.

    return { status: "pending_approval", workflowId, reason };
  }
}
