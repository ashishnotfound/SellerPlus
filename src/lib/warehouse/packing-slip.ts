/**
 * SellerPlus OS — Packing Slip Data Builder
 *
 * INTENTIONALLY isolated from React components and from any specific
 * rendering target (browser print, PDF generator, thermal printer, etc.).
 *
 * This module transforms a WarehouseOrder into a PackingSlipData structure.
 * The rendering layer (React print template, PDF lib, ZPL template) consumes
 * this structure independently — swapping renderers never requires touching
 * this file or the warehouse page.
 */

import { WarehouseOrder, PackingSlipData } from "./types";

/**
 * Build a printer/renderer-agnostic PackingSlipData object from a WarehouseOrder.
 *
 * @param order - Fully hydrated warehouse order with items and shipping info
 * @returns Flat, strongly-typed data structure ready for any rendering target
 */
export function buildPackingSlipData(order: WarehouseOrder): PackingSlipData {
  const addr = order.shipping_address ?? {};

  return {
    orderId: order.id,
    channelOrderId: order.channel_order_id,
    printedAt: new Date().toISOString(),
    recipientName: order.customer_name ?? addr.Name ?? "Customer",
    shippingAddress: addr,
    shippingMethod: order.shipping_method ?? "Standard",
    packingNotes: order.packing_notes ?? "",
    items: order.items.map((item) => ({
      sku: item.seller_sku ?? "N/A",
      title: item.title ?? "Unnamed Product",
      quantity: item.quantity_ordered,
      imageUrl: item.main_image,
    })),
  };
}

/**
 * Format a ShippingAddress object into a human-readable single string.
 * Useful for the print template and compact order card display.
 */
export function formatShippingAddress(
  addr: PackingSlipData["shippingAddress"] | null | undefined
): string {
  if (!addr) return "Address not provided";
  const lines = [
    addr.AddressLine1,
    addr.AddressLine2,
    addr.City,
    addr.StateOrRegion,
    addr.PostalCode,
    addr.CountryCode,
  ].filter(Boolean);
  return lines.join(", ") || "Address not provided";
}
