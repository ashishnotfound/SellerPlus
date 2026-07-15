/**
 * SellerPlus OS — Warehouse Operations Types
 *
 * Canonical types for the Warehouse module.
 * Designed for extensibility: future modules (Picking, Returns,
 * Inventory Transfers, Barcode Scanning) add new interfaces here.
 */

import { z } from "zod";

// ─── Role Guard ──────────────────────────────────────────────────────────────

/** Roles that are permitted to access warehouse operations. */
export const WAREHOUSE_ROLES = ["owner", "admin", "manager", "warehouse", "packer", "shipping"] as const;
export type WarehouseRole = (typeof WAREHOUSE_ROLES)[number];

/** Roles that are restricted exclusively to the warehouse portal (cannot access finance). */
export const RESTRICTED_WAREHOUSE_ROLES = ["warehouse", "packer", "shipping"] as const;
export type RestrictedWarehouseRole = (typeof RESTRICTED_WAREHOUSE_ROLES)[number];

export function isWarehouseRole(role: string): role is WarehouseRole {
  return WAREHOUSE_ROLES.includes(role as WarehouseRole);
}

export function isRestrictedRole(role: string): role is RestrictedWarehouseRole {
  return RESTRICTED_WAREHOUSE_ROLES.includes(role as RestrictedWarehouseRole);
}

// ─── Order & Item Types ───────────────────────────────────────────────────────

export interface WarehouseOrderItem {
  id: string;
  seller_sku: string | null;
  asin: string | null;
  title: string | null;
  quantity_ordered: number;
  quantity_shipped: number;
  item_price: number;
  /** Resolved from joined listings table */
  main_image: string | null;
}

export interface ShippingAddress {
  Name?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  City?: string;
  StateOrRegion?: string;
  PostalCode?: string;
  CountryCode?: string;
  [key: string]: string | undefined;
}

export interface WarehouseOrder {
  id: string;
  channel_order_id: string;
  status: string;
  customer_name: string | null;
  shipping_address: ShippingAddress | null;
  shipping_method: string | null;
  packing_notes: string | null;
  fulfillment_channel: string | null;
  purchase_date: string | null;
  items: WarehouseOrderItem[];
}

// ─── Status Transitions ───────────────────────────────────────────────────────

/** Statuses that indicate an order is awaiting warehouse action. */
export const PENDING_WAREHOUSE_STATUSES = [
  "pending", "Pending", "Unshipped", "PartiallyShipped"
] as const;

/** Statuses that indicate an order has been packed but not yet shipped. */
export const PACKED_STATUSES = ["packed", "Packed"] as const;

/** All statuses visible in the warehouse portal (pending + packed). */
export const WAREHOUSE_VISIBLE_STATUSES = [
  ...PENDING_WAREHOUSE_STATUSES,
  ...PACKED_STATUSES,
] as const;

/** Valid status transitions from the warehouse portal. */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["packed", "shipped"],
  Pending: ["packed", "shipped"],
  Unshipped: ["packed", "shipped"],
  PartiallyShipped: ["packed", "shipped"],
  packed: ["shipped"],
  Packed: ["shipped"],
};

// ─── Audit Log ───────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  order_id: string;
  user_id: string;
  previous_status: string;
  new_status: string;
  note?: string;
}

// ─── Packing Slip ────────────────────────────────────────────────────────────

export interface PackingSlipData {
  orderId: string;
  channelOrderId: string;
  printedAt: string;
  recipientName: string;
  shippingAddress: ShippingAddress;
  shippingMethod: string;
  packingNotes: string;
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    imageUrl: string | null;
  }>;
}

// ─── Zod Validators ──────────────────────────────────────────────────────────

export const StatusUpdateSchema = z.object({
  newStatus: z.enum(["packed", "shipped"]),
  note: z.string().max(500).optional(),
});

export type StatusUpdateInput = z.infer<typeof StatusUpdateSchema>;
