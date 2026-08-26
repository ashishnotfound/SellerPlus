import { describe, expect, it } from "vitest";
import {
  orderCancellationReason,
  orderFinancials,
  searchOrdersResponseSchema,
} from "@/lib/amazon/reyo-pack-order-model";

function amazonOrder() {
  return {
    orderId: "404-1234567-1234567",
    createdTime: "2026-08-24T10:00:00.000Z",
    lastUpdatedTime: "2026-08-24T11:00:00.000Z",
    programs: ["EASY_SHIP"],
    salesChannel: { channelName: "AMAZON", marketplaceId: "A21TJRUUN4KGV" },
    fulfillment: {
      fulfillmentStatus: "UNSHIPPED" as const,
      fulfilledBy: "MERCHANT" as const,
      fulfillmentServiceLevel: "STANDARD",
      shipByWindow: { latestDateTime: "2026-08-25T18:00:00.000Z" },
    },
    cancellation: {
      cancellationRequest: { cancelReason: "Customer request" },
      cancellationExecution: { cancelReason: "Buyer requested cancellation" },
    },
    orderItems: [{
      orderItemId: "item-1",
      quantityOrdered: 2,
      product: {
        asin: "B012345678",
        sellerSku: "POSTER-8X12",
        title: "Spider-Man 3 Panel Poster",
        price: { unitPrice: { amount: "149.50", currencyCode: "INR" } },
      },
      fulfillment: { quantityFulfilled: 0, quantityUnfulfilled: 2 },
    }],
    packages: [{
      packageReferenceId: "PKG-1",
      shipTime: "2026-08-24T12:00:00.000Z",
      shipFromAddress: { city: "Bengaluru", countryCode: "IN" },
      packageStatus: { status: "PendingPickUp" },
      carrier: "Amazon Easy Ship",
      shippingService: "Easy Ship",
      trackingNumber: "371317811994",
      packageItems: [{ orderItemId: "item-1", quantity: 2 }],
    }],
  };
}

describe("Orders API v2026-01-01 Reyo Pack model", () => {
  it("validates package tracking and item allocation without inventing AWB fields", () => {
    const page = searchOrdersResponseSchema.parse({
      orders: [amazonOrder()],
      pagination: { nextToken: "next-page-token" },
    });

    expect(page.orders[0].packages[0]).toMatchObject({
      packageReferenceId: "PKG-1",
      shipTime: "2026-08-24T12:00:00.000Z",
      shipFromAddress: { city: "Bengaluru", countryCode: "IN" },
      trackingNumber: "371317811994",
      packageItems: [{ orderItemId: "item-1", quantity: 2 }],
    });
    expect(page.pagination?.nextToken).toBe("next-page-token");
  });

  it("uses verified grand total or derives a total only from complete unit prices", () => {
    const order = searchOrdersResponseSchema.parse({ orders: [amazonOrder()] }).orders[0];
    expect(orderFinancials(order)).toEqual({ amount: 299, currency: "INR" });

    const withProceeds = searchOrdersResponseSchema.parse({
      orders: [{
        ...amazonOrder(),
        proceeds: { grandTotal: { amount: "280.00", currencyCode: "INR" } },
      }],
    }).orders[0];
    expect(orderFinancials(withProceeds)).toEqual({ amount: 280, currency: "INR" });
  });

  it("keeps financial totals unavailable when any item price is absent", () => {
    const source = amazonOrder();
    source.orderItems[0].product.price = undefined as never;
    const order = searchOrdersResponseSchema.parse({ orders: [source] }).orders[0];
    expect(orderFinancials(order)).toEqual({ amount: null, currency: null });
  });

  it("prefers Amazon's executed cancellation reason over the request reason", () => {
    const order = searchOrdersResponseSchema.parse({ orders: [amazonOrder()] }).orders[0];
    expect(orderCancellationReason(order)).toBe("Buyer requested cancellation");
  });
});
