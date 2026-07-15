/**
 * SellerPlus OS — Automation Actions Controller
 * 
 * Secure API endpoint to Approve, Reject, or Rollback automation triggers.
 * Verifies caller JWT token server-side via auth-middleware.
 */

import { NextResponse } from "next/server";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";
import { AUTOMATION_RULES, AutomationContext } from "@/lib/automation-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { logId, action, userId: bodyUserId } = body;

    if (!logId || !action) {
      return NextResponse.json({ error: "Missing logId or action parameter." }, { status: 400 });
    }

    if (!["approve", "reject", "rollback"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Must be 'approve', 'reject', or 'rollback'." }, { status: 400 });
    }

    // Authenticate the caller
    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    // Retrieve the log entry, ensuring RLS / owner matching
    const { data: logEntry, error: fetchError } = await supabaseAdmin
      .from("automation_logs")
      .select("*")
      .eq("id", logId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError || !logEntry) {
      return NextResponse.json({ error: "Automation log not found or access denied." }, { status: 404 });
    }

    const rule = AUTOMATION_RULES.find(r => r.id === logEntry.rule_id);
    if (!rule && (action === "approve" || action === "rollback")) {
      return NextResponse.json({ error: `Rule definition '${logEntry.rule_id}' not found in active engine.` }, { status: 404 });
    }

    const ctx: AutomationContext = {
      userId,
      supabase: supabaseAdmin
    };

    // ─────────────────────────────────────────────────────────────────
    // ACTION: APPROVE (Execute pending automation)
    // ─────────────────────────────────────────────────────────────────
    if (action === "approve") {
      if (logEntry.status !== "pending") {
        return NextResponse.json({ error: `Only pending automations can be approved. Current status: ${logEntry.status}` }, { status: 400 });
      }

      console.log(`[AutomationController] Approving pending action '${logEntry.rule_name}' for user ${userId}`);

      try {
        // Construct the evaluation payload required for execute
        const evaluation = {
          ruleId: logEntry.rule_id,
          ruleName: logEntry.rule_name,
          shouldExecute: true,
          confidence: logEntry.confidence,
          riskLevel: logEntry.risk_level,
          requiresApproval: true,
          description: logEntry.description,
          estimatedImpact: logEntry.estimated_impact || "",
          affectedEntities: logEntry.affected_entities || [],
          suggestedAction: logEntry.action_taken || "",
          rollbackStrategy: "",
          metadata: {}
        };

        const result = await rule!.execute(ctx, evaluation);

        // Update the log entry
        await supabaseAdmin
          .from("automation_logs")
          .update({
            status: result.success ? "executed" : "failed",
            result_message: result.message,
            rollback_data: result.rollbackData || null,
            executed_at: new Date().toISOString()
          })
          .eq("id", logId);

        return NextResponse.json({ success: result.success, message: result.message, changes: result.changes });
      } catch (err: any) {
        console.error(`[AutomationController] Rule execution crash:`, err);
        await supabaseAdmin
          .from("automation_logs")
          .update({
            status: "failed",
            result_message: `Execution failed: ${err.message}`,
            executed_at: new Date().toISOString()
          })
          .eq("id", logId);

        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // ACTION: REJECT (Cancel pending automation)
    // ─────────────────────────────────────────────────────────────────
    if (action === "reject") {
      if (logEntry.status !== "pending") {
        return NextResponse.json({ error: `Only pending automations can be rejected. Current status: ${logEntry.status}` }, { status: 400 });
      }

      console.log(`[AutomationController] Rejecting pending action '${logEntry.rule_name}' for user ${userId}`);

      await supabaseAdmin
        .from("automation_logs")
        .update({
          status: "rejected",
          result_message: "Action rejected by user.",
          executed_at: new Date().toISOString()
        })
        .eq("id", logId);

      return NextResponse.json({ success: true, message: "Action rejected successfully." });
    }

    // ─────────────────────────────────────────────────────────────────
    // ACTION: ROLLBACK (Revert executed automation)
    // ─────────────────────────────────────────────────────────────────
    if (action === "rollback") {
      if (logEntry.status !== "executed") {
        return NextResponse.json({ error: `Only executed automations can be rolled back. Current status: ${logEntry.status}` }, { status: 400 });
      }

      if (!logEntry.rollback_data) {
        return NextResponse.json({ error: "No rollback dataset exists for this execution log." }, { status: 400 });
      }

      if (!rule!.rollback) {
        return NextResponse.json({ error: `Rule '${logEntry.rule_name}' does not implement a rollback algorithm.` }, { status: 400 });
      }

      console.log(`[AutomationController] Rolling back executed action '${logEntry.rule_name}' for user ${userId}`);

      try {
        const result = await rule!.rollback(ctx, logEntry.rollback_data);

        if (result.success) {
          await supabaseAdmin
            .from("automation_logs")
            .update({
              status: "rolled_back",
              result_message: `Rolled back: ${result.message}`
            })
            .eq("id", logId);
        }

        return NextResponse.json({ success: result.success, message: result.message, changes: result.changes });
      } catch (err: any) {
        console.error(`[AutomationController] Rollback exception:`, err);
        return NextResponse.json({ success: false, error: `Rollback failed: ${err.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Unsupported state reach." }, { status: 500 });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("[AutomationActionRoute] Fatal error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
