import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import {
  PRESET_SCHEDULES,
  isPresetScheduleKey,
  nextCronRunAfter,
} from "@/lib/jobs/cron-utils";
import { isSchedulableJobType } from "@/lib/jobs/job-catalog";

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  taskType: z.string().min(1).max(80),
  scheduleKey: z.string().min(1).max(40),
}).strict();

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused"]),
}).strict();

const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "automation.read");
    const { data, error } = await actor.supabaseAdmin
      .from("ai_schedules")
      .select("id, title, task_type, cron_schedule, status, last_run, next_run, last_error, created_at")
      .eq("workspace_id", actor.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "automation.manage");
    const input = createSchema.parse(await request.json());
    if (!isSchedulableJobType(input.taskType)) {
      return NextResponse.json({ error: "This job type cannot be scheduled from the task center." }, { status: 400 });
    }
    if (!isPresetScheduleKey(input.scheduleKey)) {
      return NextResponse.json({ error: "Select a supported schedule." }, { status: 400 });
    }

    const cron = PRESET_SCHEDULES[input.scheduleKey].cron;
    const { data, error } = await actor.supabaseAdmin.rpc("create_workspace_ai_schedule", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_title: input.title,
      p_task_type: input.taskType,
      p_cron_schedule: cron,
      p_next_run: nextCronRunAfter(cron).toISOString(),
    });
    if (error?.code === "23505") {
      return NextResponse.json({ error: "This task type already has a schedule in the workspace." }, { status: 409 });
    }
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid schedule configuration." }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "automation.manage");
    const input = updateSchema.parse(await request.json());
    let nextRun: string | null = null;
    if (input.status === "active") {
      const { data: schedule, error: scheduleError } = await actor.supabaseAdmin
        .from("ai_schedules")
        .select("cron_schedule")
        .eq("workspace_id", actor.workspaceId)
        .eq("id", input.id)
        .maybeSingle();
      if (scheduleError) throw scheduleError;
      if (!schedule) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
      nextRun = nextCronRunAfter(schedule.cron_schedule).toISOString();
    }
    const { data, error } = await actor.supabaseAdmin.rpc("set_workspace_ai_schedule_status", {
      p_workspace_id: actor.workspaceId,
      p_schedule_id: input.id,
      p_actor_id: actor.userId,
      p_status: input.status,
      p_resume_after: nextRun,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid schedule update." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "automation.manage");
    const url = new URL(request.url);
    const input = deleteSchema.parse({ id: url.searchParams.get("id") });
    const { data, error } = await actor.supabaseAdmin.rpc("delete_workspace_ai_schedule", {
      p_workspace_id: actor.workspaceId,
      p_schedule_id: input.id,
      p_actor_id: actor.userId,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid schedule." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
