import { NextResponse } from "next/server";
import {
  authenticate,
  authErrorResponse,
  requireSuperAdmin,
} from "@/lib/auth-middleware";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requireSuperAdmin(actor);

    const [profilesResult, membershipsResult, subscriptionsResult, auditResult] =
      await Promise.all([
        actor.supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, role, is_super_admin, is_suspended, created_at")
          .order("created_at", { ascending: false }),
        actor.supabaseAdmin
          .from("workspace_members")
          .select("user_id, workspace_id, role, workspaces(name)"),
        actor.supabaseAdmin
          .from("subscriptions")
          .select("user_id, plan_type, status"),
        actor.supabaseAdmin
          .from("admin_audit_logs")
          .select("id, action, entity, admin_email, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const failure = [
      profilesResult.error,
      membershipsResult.error,
      subscriptionsResult.error,
      auditResult.error,
    ].find(Boolean);
    if (failure) throw failure;

    const memberships = membershipsResult.data ?? [];
    const subscriptions = subscriptionsResult.data ?? [];
    const merchants = (profilesResult.data ?? []).map((profile) => {
      const member = memberships.find((item) => item.user_id === profile.id);
      const subscription = subscriptions.find((item) => item.user_id === profile.id);
      const relation = member?.workspaces;
      const workspace = Array.isArray(relation) ? relation[0] : relation;

      return {
        ...profile,
        workspaceName: workspace?.name ?? "No workspace",
        workspaceRole: member?.role ?? "none",
        subscriptionPlan: subscription?.plan_type ?? "free",
        subscriptionStatus: subscription?.status ?? "inactive",
      };
    });

    return NextResponse.json({
      data: {
        merchants,
        stats: {
          totalUsers: merchants.length,
          totalWorkspaces: new Set(memberships.map((item) => item.workspace_id)).size,
          activePaidSubs: subscriptions.filter(
            (item) => item.plan_type !== "free" && item.status === "active",
          ).length,
          suspendedCount: merchants.filter((item) => item.is_suspended).length,
        },
        auditLogs: (auditResult.data ?? []).map((log) => ({
          id: log.id,
          action: log.action,
          entity: log.entity,
          timestamp: log.created_at,
          email: log.admin_email ?? "System",
        })),
      },
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
