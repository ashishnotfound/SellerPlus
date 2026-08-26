import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const paramsSchema = z.object({ shipmentId: z.string().uuid() });

export async function GET(
  request: Request,
  context: { params: Promise<{ shipmentId: string }> },
): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.read");
    const { shipmentId } = paramsSchema.parse(await context.params);
    const [{ data: shipment, error: shipmentError }, { data: events, error: eventsError }] =
      await Promise.all([
        actor.supabaseAdmin
          .from("shipments")
          .select("id, order_id, awb_code, tracking_number, carrier, packing_status, packed_at, updated_at, order:orders!inner(channel_order_id, purchase_date, ship_by_date, cancellation_status, cancellation_reason, cancelled_at)")
          .eq("workspace_id", actor.workspaceId)
          .eq("id", shipmentId)
          .maybeSingle(),
        actor.supabaseAdmin
          .from("reyo_pack_packing_events")
          .select("id, session_id, actor_id, event_type, awb, sku, quantity, previous_status, new_status, reason, metadata, correlation_id, created_at")
          .eq("workspace_id", actor.workspaceId)
          .eq("shipment_id", shipmentId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(1_000),
      ]);
    if (shipmentError || eventsError) throw shipmentError ?? eventsError;
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found.", code: "NOT_FOUND" }, { status: 404 });
    }
    return noStoreJson({ data: { shipment, events: events ?? [] } });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid packing timeline request.");
  }
}
