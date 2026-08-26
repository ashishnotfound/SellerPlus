import { NextResponse } from "next/server";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const defaults = {
  sound_enabled: true,
  vibration_enabled: true,
  sound_volume: 1,
  scan_debounce_ms: 1500,
  claim_ttl_seconds: 120,
  sync_interval_minutes: 15,
  allow_manual_awb: true,
  version: 0,
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.read");
    const { data, error } = await actor.supabaseAdmin
      .from("reyo_pack_settings")
      .select("sound_enabled, vibration_enabled, sound_volume, scan_debounce_ms, claim_ttl_seconds, sync_interval_minutes, allow_manual_awb, version, updated_at")
      .eq("workspace_id", actor.workspaceId)
      .maybeSingle();
    if (error) throw error;
    return noStoreJson({ data: data ?? defaults });
  } catch (error) {
    return reyoPackErrorResponse(error, "Unable to load Reyo Pack settings.");
  }
}
