/**
 * Unit Tests — Warehouse Packing Slip Builder
 *
 * Verifies the pure data transformation logic in packing-slip.ts.
 * No React, no Supabase, no network — pure function tests.
 */

import { describe, it, expect } from "vitest";
import { buildPackingSlipData, formatShippingAddress } from "../lib/warehouse/packing-slip";
import type { WarehouseOrder } from "../lib/warehouse/types";

const mockOrder: WarehouseOrder = {
  id: "order-abc-123",
  channel_order_id: "AMZ-2026-001",
  status: "Unshipped",
  customer_name: "Ravi Kumar",
  shipping_address: {
    Name: "Ravi Kumar",
    AddressLine1: "12 MG Road",
    AddressLine2: "",
    City: "Bengaluru",
    StateOrRegion: "Karnataka",
    PostalCode: "560001",
    CountryCode: "IN",
  },
  shipping_method: "Express",
  packing_notes: "Fragile — handle with care",
  fulfillment_channel: "MFN",
  purchase_date: "2026-07-14T08:00:00Z",
  items: [
    {
      id: "item-1",
      seller_sku: "SP-PROD-001",
      asin: "B09EXAMPLE",
      title: "Premium Wireless Headphones",
      quantity_ordered: 2,
      quantity_shipped: 0,
      item_price: 1999,
      main_image: "https://images.example.com/product-1.jpg",
    },
    {
      id: "item-2",
      seller_sku: "SP-PROD-002",
      asin: "B09EXAMPLE2",
      title: "Charging Cable Pack",
      quantity_ordered: 1,
      quantity_shipped: 0,
      item_price: 299,
      main_image: null,
    },
  ],
};

describe("buildPackingSlipData", () => {
  it("maps orderId and channelOrderId correctly", () => {
    const slip = buildPackingSlipData(mockOrder);
    expect(slip.orderId).toBe("order-abc-123");
    expect(slip.channelOrderId).toBe("AMZ-2026-001");
  });

  it("sets recipientName from customer_name", () => {
    const slip = buildPackingSlipData(mockOrder);
    expect(slip.recipientName).toBe("Ravi Kumar");
  });

  it("falls back to address.Name when customer_name is null", () => {
    const order = { ...mockOrder, customer_name: null };
    const slip = buildPackingSlipData(order);
    expect(slip.recipientName).toBe("Ravi Kumar");
  });

  it("falls back to 'Customer' when both customer_name and address Name are absent", () => {
    const order: WarehouseOrder = {
      ...mockOrder,
      customer_name: null,
      shipping_address: {},
    };
    const slip = buildPackingSlipData(order);
    expect(slip.recipientName).toBe("Customer");
  });

  it("maps shipping method correctly", () => {
    const slip = buildPackingSlipData(mockOrder);
    expect(slip.shippingMethod).toBe("Express");
  });

  it("defaults shipping method to 'Standard' when null", () => {
    const order = { ...mockOrder, shipping_method: null };
    const slip = buildPackingSlipData(order);
    expect(slip.shippingMethod).toBe("Standard");
  });

  it("maps packing notes correctly", () => {
    const slip = buildPackingSlipData(mockOrder);
    expect(slip.packingNotes).toBe("Fragile — handle with care");
  });

  it("defaults packing notes to empty string when null", () => {
    const order = { ...mockOrder, packing_notes: null };
    const slip = buildPackingSlipData(order);
    expect(slip.packingNotes).toBe("");
  });

  it("maps items with correct sku, title, quantity and imageUrl", () => {
    const slip = buildPackingSlipData(mockOrder);
    expect(slip.items).toHaveLength(2);
    expect(slip.items[0]).toEqual({
      sku: "SP-PROD-001",
      title: "Premium Wireless Headphones",
      quantity: 2,
      imageUrl: "https://images.example.com/product-1.jpg",
    });
    expect(slip.items[1]).toEqual({
      sku: "SP-PROD-002",
      title: "Charging Cable Pack",
      quantity: 1,
      imageUrl: null,
    });
  });

  it("uses 'N/A' for null sku", () => {
    const order = {
      ...mockOrder,
      items: [{ ...mockOrder.items[0], seller_sku: null }],
    };
    const slip = buildPackingSlipData(order);
    expect(slip.items[0].sku).toBe("N/A");
  });

  it("uses 'Unnamed Product' for null title", () => {
    const order = {
      ...mockOrder,
      items: [{ ...mockOrder.items[0], title: null }],
    };
    const slip = buildPackingSlipData(order);
    expect(slip.items[0].title).toBe("Unnamed Product");
  });

  it("sets printedAt to a valid ISO string near current time", () => {
    const before = Date.now();
    const slip = buildPackingSlipData(mockOrder);
    const after = Date.now();
    const ts = new Date(slip.printedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 100);
  });
});

describe("formatShippingAddress", () => {
  it("formats all fields correctly", () => {
    const result = formatShippingAddress(mockOrder.shipping_address);
    expect(result).toContain("12 MG Road");
    expect(result).toContain("Bengaluru");
    expect(result).toContain("Karnataka");
    expect(result).toContain("560001");
    expect(result).toContain("IN");
  });

  it("skips empty AddressLine2", () => {
    const result = formatShippingAddress(mockOrder.shipping_address);
    // Should not contain trailing comma from empty AddressLine2
    expect(result).not.toMatch(/,\s*,/);
  });

  it("returns fallback for null address", () => {
    expect(formatShippingAddress(null)).toBe("Address not provided");
    expect(formatShippingAddress(undefined)).toBe("Address not provided");
  });

  it("returns fallback for empty address object", () => {
    expect(formatShippingAddress({})).toBe("Address not provided");
  });
});
