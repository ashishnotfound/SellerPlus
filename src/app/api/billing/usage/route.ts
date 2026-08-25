import { NextResponse } from "next/server";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

function monthStart() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");

    const [{ data: usage, error: usageError }, { data: subscription, error: subscriptionError }, { data: payments, error: paymentsError }] =
      await Promise.all([
        actor.supabaseAdmin.rpc("get_workspace_usage_summary", {
          p_workspace_id: actor.workspaceId,
          p_period_start: monthStart(),
        }),
        actor.supabaseAdmin
          .from("subscriptions")
          .select("plan_type, status, current_period_start, current_period_end, cancel_at_period_end")
          .eq("workspace_id", actor.workspaceId)
          .in("status", ["active", "trialing", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        actor.supabaseAdmin
          .from("payments")
          .select("id, order_id, amount, currency, status, created_at")
          .eq("workspace_id", actor.workspaceId)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

    if (usageError || subscriptionError || paymentsError) {
      throw usageError ?? subscriptionError ?? paymentsError;
    }

    return NextResponse.json({
      data: {
        billingConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        subscription: subscription ?? null,
        usage,
        payments: payments ?? [],
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
