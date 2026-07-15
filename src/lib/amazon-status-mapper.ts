/**
 * SellerPlus OS — Amazon SP-API Status Mapper
 * 
 * Translates Amazon SP-API order statuses to SellerPlus internal statuses
 * and vice-versa. Handles all known SP-API status values including edge cases.
 * 
 * Amazon SP-API Order Statuses:
 *   Pending, Unshipped, PartiallyShipped, Shipped, InvoiceUnconfirmed,
 *   Canceled, Unfulfillable, PendingAvailability
 * 
 * SellerPlus Internal Statuses (DB enum):
 *   pending, processing, shipped, delivered, returned, cancelled, unfulfillable
 */

// ─── Types ───────────────────────────────────────────────────────────

export type AmazonOrderStatus =
  | "Pending"
  | "Unshipped"
  | "PartiallyShipped"
  | "Shipped"
  | "InvoiceUnconfirmed"
  | "Canceled"
  | "Unfulfillable"
  | "PendingAvailability";

export type InternalOrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "returned"
  | "cancelled"
  | "unfulfillable";

// ─── Mapping ─────────────────────────────────────────────────────────

const AMAZON_TO_INTERNAL: Record<string, InternalOrderStatus> = {
  // Pre-shipment
  "Pending": "pending",
  "PendingAvailability": "pending",
  "InvoiceUnconfirmed": "pending",
  "Unshipped": "processing",
  "PartiallyShipped": "processing",

  // In-transit
  "Shipped": "shipped",

  // Terminal states
  "Canceled": "cancelled",
  "Unfulfillable": "unfulfillable",

  // Legacy/alternative casing encountered in sandbox responses
  "pending": "pending",
  "shipped": "shipped",
  "delivered": "delivered",
  "cancelled": "cancelled",
  "canceled": "cancelled",
  "returned": "returned",
};

const INTERNAL_TO_DISPLAY: Record<InternalOrderStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
  unfulfillable: "Unfulfillable",
};

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Maps an Amazon SP-API order status to the SellerPlus internal enum.
 * Falls back to "processing" for unknown statuses (with a warning log),
 * ensuring sync never fails on an unrecognized status.
 */
export function mapAmazonStatus(amazonStatus: string): InternalOrderStatus {
  const mapped = AMAZON_TO_INTERNAL[amazonStatus];
  if (mapped) return mapped;

  // Defensive: handle unknown statuses without crashing
  console.warn(
    `[StatusMapper] Unknown Amazon order status: "${amazonStatus}". Defaulting to "processing".`
  );
  return "processing";
}

/**
 * Returns a human-readable display label for an internal status.
 */
export function getStatusDisplay(internal: InternalOrderStatus): string {
  return INTERNAL_TO_DISPLAY[internal] || internal;
}

/**
 * Returns the Tailwind color class token for a given status.
 * Used by the UI to render status badges consistently.
 */
export function getStatusColor(status: InternalOrderStatus): string {
  switch (status) {
    case "pending":       return "amber";
    case "processing":    return "blue";
    case "shipped":       return "sky";
    case "delivered":     return "emerald";
    case "returned":      return "orange";
    case "cancelled":     return "red";
    case "unfulfillable": return "rose";
    default:              return "zinc";
  }
}

/**
 * Returns the full set of valid internal statuses.
 * Useful for DB constraint generation and validation.
 */
export function getAllInternalStatuses(): InternalOrderStatus[] {
  return ["pending", "processing", "shipped", "delivered", "returned", "cancelled", "unfulfillable"];
}
