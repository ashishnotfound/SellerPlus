/**
 * SellerPlus OS — Warehouse Audit Log Service
 *
 * Immutable, append-only audit trail of every order status change.
 * Every warehouse action (Mark as Packed, Mark as Shipped) records:
 *   - who performed it
 *   - from which status
 *   - to which status
 *   - optional note
 *
 * NEVER update or delete rows from warehouse_audit_log.
 * Use the admin client to bypass RLS — all callers must pass a verified userId.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { AuditLogEntry } from "./types";
import { log } from "@/lib/logger";

/**
 * Appends a single, immutable audit log entry for an order status transition.
 *
 * @param supabaseAdmin - Service-role client (bypasses RLS; caller must authenticate first)
 * @param entry - Transition details
 * @returns The created log row ID, or null if the insert failed (non-fatal)
 */
export async function appendWarehouseAuditLog(
  supabaseAdmin: SupabaseClient,
  entry: AuditLogEntry
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("warehouse_audit_log")
      .insert({
        order_id: entry.order_id,
        user_id: entry.user_id,
        previous_status: entry.previous_status,
        new_status: entry.new_status,
        note: entry.note ?? null,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      log.warn(
        `[WarehouseAuditLog] Insert failed for order ${entry.order_id}: ${error.message}`,
        undefined,
        { orderId: entry.order_id, userId: entry.user_id }
      );
      return null;
    }

    log.info(
      `[WarehouseAuditLog] Status transition recorded`,
      undefined,
      {
        auditId: data.id,
        orderId: entry.order_id,
        userId: entry.user_id,
        from: entry.previous_status,
        to: entry.new_status,
      }
    );

    return data.id as string;
  } catch (err) {
    log.warn(`[WarehouseAuditLog] Unexpected error: ${err}`);
    return null;
  }
}

/**
 * Fetch the complete audit history for a given order.
 * Used by the order detail drawer.
 */
export async function getOrderAuditHistory(
  supabaseAdmin: SupabaseClient,
  orderId: string
): Promise<AuditLogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("warehouse_audit_log")
    .select("order_id, user_id, previous_status, new_status, note, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    log.warn(`[WarehouseAuditLog] Fetch failed for order ${orderId}: ${error.message}`);
    return [];
  }

  return (data ?? []) as AuditLogEntry[];
}
