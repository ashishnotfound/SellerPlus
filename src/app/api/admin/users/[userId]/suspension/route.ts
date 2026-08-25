import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requireSuperAdmin,
} from "@/lib/auth-middleware";

const requestSchema = z.object({ suspended: z.boolean() }).strict();
const paramsSchema = z.object({ userId: z.string().uuid() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await authenticate(request);
    requireSuperAdmin(actor);

    const { userId } = paramsSchema.parse(await context.params);
    const { suspended } = requestSchema.parse(await request.json());
    if (userId === actor.userId) {
      return NextResponse.json(
        { error: "You cannot suspend your own administrator account.", code: "SELF_SUSPENSION" },
        { status: 409 },
      );
    }

    const { data: target, error: targetError } = await actor.supabaseAdmin
      .from("profiles")
      .select("id, is_super_admin, is_suspended")
      .eq("id", userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
      return NextResponse.json(
        { error: "The requested user does not exist.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (target.is_super_admin) {
      return NextResponse.json(
        { error: "Super-administrator accounts cannot be suspended here.", code: "PROTECTED_ACCOUNT" },
        { status: 409 },
      );
    }

    const { error: updateError } = await actor.supabaseAdmin
      .from("profiles")
      .update({ is_suspended: suspended })
      .eq("id", userId)
      .eq("is_suspended", target.is_suspended);
    if (updateError) throw updateError;

    const { error: auditError } = await actor.supabaseAdmin.from("admin_audit_logs").insert({
      action: suspended ? "USER_SUSPENDED" : "USER_RESTORED",
      entity: "Merchant Profile",
      admin_id: actor.userId,
      admin_email: actor.email,
      target_user_id: userId,
      details: { previous: target.is_suspended, next: suspended },
    });
    if (auditError) throw auditError;

    return NextResponse.json({ data: { userId, suspended } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid suspension request.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
