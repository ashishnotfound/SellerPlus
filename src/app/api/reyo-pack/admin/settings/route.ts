import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const settingsSchema = z.object({
  expectedVersion: z.number().int().min(0),
  soundEnabled: z.boolean(),
  vibrationEnabled: z.boolean(),
  soundVolume: z.number().min(0).max(1),
  scanDebounceMs: z.number().int().min(250).max(10_000),
  claimTtlSeconds: z.number().int().min(30).max(600),
  syncIntervalMinutes: z.number().int().min(5).max(1_440),
  allowManualAwb: z.boolean(),
}).strict();

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const input = settingsSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("save_reyo_pack_settings", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_expected_version: input.expectedVersion,
      p_sound_enabled: input.soundEnabled,
      p_vibration_enabled: input.vibrationEnabled,
      p_sound_volume: input.soundVolume,
      p_scan_debounce_ms: input.scanDebounceMs,
      p_claim_ttl_seconds: input.claimTtlSeconds,
      p_sync_interval_minutes: input.syncIntervalMinutes,
      p_allow_manual_awb: input.allowManualAwb,
    });
    if (error) throw error;
    return noStoreJson({ data });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid Reyo Pack settings.");
  }
}
