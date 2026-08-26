import { z } from "zod";

export const packingStatusSchema = z.enum([
  "UNPACKED",
  "PACKING",
  "PACKED",
  "CANCELLED",
  "ERROR",
]);

export const packingItemSchema = z.object({
  orderItemId: z.string().uuid().optional(),
  sku: z.string().nullable().optional(),
  asin: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  quantity: z.number().int().min(0),
  quantityRemaining: z.number().int().min(0).optional(),
}).passthrough();

export const sessionMutationResultSchema = z.object({
  outcome: z.enum(["STARTED", "RESUMED", "COMPLETED", "ABANDONED"]),
  sessionId: z.string().uuid(),
  sessionNumber: z.coerce.number().int().positive(),
  mode: z.enum(["PACKING", "PUTAWAY"]).optional(),
  packagesPacked: z.number().int().min(0).optional(),
  unitsPacked: z.number().int().min(0).optional(),
  cancelledScans: z.number().int().min(0).optional(),
  invalidScans: z.number().int().min(0).optional(),
  errors: z.number().int().min(0).optional(),
  startedAt: z.string().datetime().nullable().optional(),
  endedAt: z.string().datetime().nullable().optional(),
}).passthrough();

export const scanResultSchema = z.object({
  outcome: z.enum([
    "INVALID_BARCODE",
    "BARCODE_NOT_FOUND",
    "AMBIGUOUS_BARCODE",
    "ORDER_CANCELLED",
    "ALREADY_PACKED",
    "PACKING_ERROR",
    "IN_USE",
    "ORDER_FOUND",
  ]),
  orderId: z.string().uuid().optional(),
  amazonOrderId: z.string().optional(),
  shipmentId: z.string().uuid().optional(),
  awb: z.string().nullable().optional(),
  barcode: z.string().optional(),
  packingStatus: packingStatusSchema.optional(),
  packedAt: z.string().datetime().nullable().optional(),
  cancelledAt: z.string().datetime().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  shipByDate: z.string().datetime().nullable().optional(),
  shippingMethod: z.string().nullable().optional(),
  labelAvailable: z.boolean().optional(),
  claimExpiresAt: z.string().datetime().nullable().optional(),
  items: z.array(packingItemSchema).optional(),
  message: z.string().optional(),
}).passthrough();
export type ScanResult = z.infer<typeof scanResultSchema>;

export const packResultSchema = z.object({
  outcome: z.enum([
    "ORDER_CANCELLED",
    "ALREADY_PACKED",
    "CLAIM_REQUIRED",
    "SHIPMENT_ITEMS_REQUIRED",
    "SHIPMENT_QUANTITY_CONFLICT",
    "NO_PACKABLE_UNITS",
    "PACKED",
  ]),
  orderId: z.string().uuid().optional(),
  amazonOrderId: z.string().optional(),
  shipmentId: z.string().uuid(),
  awb: z.string().nullable().optional(),
  packedAt: z.string().datetime().nullable().optional(),
  cancelledAt: z.string().datetime().nullable().optional(),
  unitsPacked: z.number().int().min(0).optional(),
  items: z.array(packingItemSchema).optional(),
  message: z.string().optional(),
}).passthrough();
export type PackResult = z.infer<typeof packResultSchema>;

export const operationalPageSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  total: z.coerce.number().int().min(0),
});

export const putawayLookupResultSchema = z.object({
  outcome: z.enum([
    "PRODUCT_NOT_FOUND",
    "AMBIGUOUS_PRODUCT",
    "LOCATION_NOT_ASSIGNED",
    "LOCATION_INACTIVE",
    "PRODUCT_FOUND",
  ]),
  barcode: z.string().optional(),
  skuId: z.string().uuid().optional(),
  sku: z.string().optional(),
  asin: z.string().nullable().optional(),
  productTitle: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  locationId: z.string().uuid().optional(),
  locationCode: z.string().optional(),
  locationName: z.string().optional(),
  locationType: z.enum(["WAREHOUSE", "RACK", "SHELF", "BIN"]).optional(),
  assignmentVersion: z.coerce.number().int().positive().optional(),
  expectedQuantity: z.number().int().min(0).nullable().optional(),
  message: z.string().optional(),
}).passthrough();

export const putawayConfirmResultSchema = z.object({
  outcome: z.enum([
    "LOCATION_NOT_ASSIGNED",
    "LOCATION_CHANGED",
    "PUTAWAY_CONFIRMED",
  ]),
  skuId: z.string().uuid(),
  sku: z.string(),
  asin: z.string().nullable().optional(),
  productTitle: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  locationId: z.string().uuid().optional(),
  locationCode: z.string().optional(),
  locationName: z.string().optional(),
  assignmentVersion: z.coerce.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  confirmedAt: z.string().datetime().optional(),
  message: z.string().optional(),
}).passthrough();
