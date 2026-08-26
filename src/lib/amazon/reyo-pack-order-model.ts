import { z } from "zod";

const moneySchema = z.object({
  amount: z.string().max(100),
  currencyCode: z.string().min(1).max(10),
}).passthrough();

const productSchema = z.object({
  asin: z.string().max(20).optional(),
  title: z.string().max(10_000).optional(),
  sellerSku: z.string().max(500).optional(),
  price: z.object({ unitPrice: moneySchema.optional() }).passthrough().optional(),
}).passthrough();

export const reyoPackOrderItemSchema = z.object({
  orderItemId: z.string().min(1).max(200),
  quantityOrdered: z.number().int().min(0).max(1_000_000),
  product: productSchema,
  fulfillment: z.object({
    quantityFulfilled: z.number().int().min(0).max(1_000_000).optional(),
    quantityUnfulfilled: z.number().int().min(0).max(1_000_000).optional(),
  }).passthrough().optional(),
}).passthrough();

export const reyoPackPackageSchema = z.object({
  packageReferenceId: z.string().min(1).max(500),
  createdTime: z.string().datetime().optional(),
  shipTime: z.string().datetime().optional(),
  shipFromAddress: z.record(z.unknown()).optional(),
  packageStatus: z.object({
    status: z.string().min(1).max(100),
    detailedStatus: z.string().max(200).optional(),
  }).passthrough().optional(),
  carrier: z.string().max(300).optional(),
  shippingService: z.string().max(300).optional(),
  trackingNumber: z.string().min(1).max(500).optional(),
  packageItems: z.array(z.object({
    orderItemId: z.string().min(1).max(200),
    quantity: z.number().int().min(1).max(1_000_000),
  }).passthrough()).max(1_000).default([]),
}).passthrough();

export const reyoPackAmazonOrderSchema = z.object({
  orderId: z.string().min(1).max(200),
  createdTime: z.string().datetime(),
  lastUpdatedTime: z.string().datetime(),
  programs: z.array(z.string().max(100)).max(100).default([]),
  salesChannel: z.object({
    channelName: z.string().max(100).optional(),
    marketplaceId: z.string().max(100).optional(),
  }).passthrough().optional(),
  proceeds: z.object({ grandTotal: moneySchema.optional() }).passthrough().optional(),
  fulfillment: z.object({
    fulfillmentStatus: z.enum([
      "PENDING_AVAILABILITY",
      "PENDING",
      "UNSHIPPED",
      "PARTIALLY_SHIPPED",
      "SHIPPED",
      "CANCELLED",
      "UNFULFILLABLE",
    ]),
    fulfilledBy: z.enum(["MERCHANT", "AMAZON"]).optional(),
    fulfillmentServiceLevel: z.string().max(200).optional(),
    shipByWindow: z.object({
      earliestDateTime: z.string().datetime().optional(),
      latestDateTime: z.string().datetime().optional(),
    }).passthrough().optional(),
  }).passthrough(),
  cancellation: z.object({
    cancellationRequest: z.object({
      requester: z.string().max(100).optional(),
      cancelReason: z.string().max(2_000).optional(),
    }).passthrough().optional(),
    cancellationExecution: z.object({
      cancelledBy: z.string().max(100).optional(),
      cancelReason: z.string().max(2_000).optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
  orderItems: z.array(reyoPackOrderItemSchema).max(5_000),
  packages: z.array(reyoPackPackageSchema).max(1_000).default([]),
}).passthrough();

export const searchOrdersResponseSchema = z.object({
  orders: z.array(reyoPackAmazonOrderSchema).max(100),
  pagination: z.object({ nextToken: z.string().max(20_000).optional() }).passthrough().optional(),
  lastUpdatedBefore: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
}).passthrough();

export const getOrderResponseSchema = reyoPackAmazonOrderSchema;

export type ReyoPackAmazonOrder = z.infer<typeof reyoPackAmazonOrderSchema>;
export type ReyoPackAmazonPackage = z.infer<typeof reyoPackPackageSchema>;

export function orderCancellationReason(order: ReyoPackAmazonOrder): string | null {
  return order.cancellation?.cancellationExecution?.cancelReason
    ?? order.cancellation?.cancellationRequest?.cancelReason
    ?? null;
}

export function orderFinancials(order: ReyoPackAmazonOrder): {
  amount: number | null;
  currency: string | null;
} {
  const total = order.proceeds?.grandTotal;
  if (total) {
    const amount = Number(total.amount);
    if (Number.isFinite(amount) && amount >= 0) {
      return { amount, currency: total.currencyCode };
    }
  }

  let amount = 0;
  let currency: string | null = null;
  for (const item of order.orderItems) {
    const unitPrice = item.product.price?.unitPrice;
    if (!unitPrice) return { amount: null, currency: null };
    const numericAmount = Number(unitPrice.amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return { amount: null, currency: null };
    }
    if (currency && currency !== unitPrice.currencyCode) {
      return { amount: null, currency: null };
    }
    currency = unitPrice.currencyCode;
    amount += numericAmount * item.quantityOrdered;
  }
  return currency ? { amount, currency } : { amount: null, currency: null };
}
