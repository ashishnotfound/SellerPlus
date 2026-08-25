import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50),
});
const expenseSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  expectedVersion: z.number().int().positive().nullable().optional(),
  category: z.string().trim().min(1).max(80),
  amount: z.number().finite().positive().max(9_999_999_999.99),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
  description: z.string().trim().max(2_000).default(""),
  date: z.string().date(),
  isRecurring: z.boolean().default(false),
  recurrenceInterval: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.isRecurring !== Boolean(value.recurrenceInterval)) {
    context.addIssue({ code: "custom", path: ["recurrenceInterval"], message: "Recurring expenses require an interval." });
  }
  if (value.id && !value.expectedVersion) {
    context.addIssue({ code: "custom", path: ["expectedVersion"], message: "The expense version is required." });
  }
});
const deleteSchema = z.object({ id: z.string().uuid(), expectedVersion: z.coerce.number().int().positive() });

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.read");
    const url = new URL(request.url);
    const query = pageSchema.parse({ page: url.searchParams.get("page") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
    const { data, error } = await actor.supabaseAdmin.rpc("get_workspace_expenses_page", {
      p_workspace_id: actor.workspaceId,
      p_limit: query.limit,
      p_offset: (query.page - 1) * query.limit,
    });
    if (error) throw error;
    return NextResponse.json({ data, page: query.page, limit: query.limit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid expense query." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const input = expenseSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("save_workspace_expense", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_expense_id: input.id ?? null,
      p_expected_version: input.expectedVersion ?? null,
      p_category: input.category,
      p_amount: input.amount,
      p_currency: input.currency,
      p_description: input.description,
      p_date: input.date,
      p_is_recurring: input.isRecurring,
      p_recurrence_interval: input.isRecurring ? input.recurrenceInterval : null,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    if (error?.code === "40001") return NextResponse.json({ error: error.message }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ data }, { status: input.id ? 200 : 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid expense configuration." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const url = new URL(request.url);
    const input = deleteSchema.parse({ id: url.searchParams.get("id"), expectedVersion: url.searchParams.get("version") });
    const { data, error } = await actor.supabaseAdmin.rpc("delete_workspace_expense", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_expense_id: input.id,
      p_expected_version: input.expectedVersion,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    if (error?.code === "40001") return NextResponse.json({ error: error.message }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid expense." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
