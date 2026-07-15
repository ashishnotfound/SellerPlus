/**
 * Unit Tests — Warehouse Types & RBAC Guards
 *
 * Tests role guard functions, status transition rules, and type guards
 * from warehouse/types.ts. Pure logic tests — no IO.
 */

import { describe, it, expect } from "vitest";
import {
  isWarehouseRole,
  isRestrictedRole,
  WAREHOUSE_ROLES,
  RESTRICTED_WAREHOUSE_ROLES,
  ALLOWED_TRANSITIONS,
  WAREHOUSE_VISIBLE_STATUSES,
  StatusUpdateSchema,
} from "../lib/warehouse/types";

describe("isWarehouseRole", () => {
  it("returns true for all warehouse roles", () => {
    for (const role of WAREHOUSE_ROLES) {
      expect(isWarehouseRole(role), `Expected "${role}" to be a warehouse role`).toBe(true);
    }
  });

  it("returns true for standard business roles", () => {
    expect(isWarehouseRole("owner")).toBe(true);
    expect(isWarehouseRole("admin")).toBe(true);
    expect(isWarehouseRole("manager")).toBe(true);
  });

  it("returns false for unknown roles", () => {
    expect(isWarehouseRole("superuser")).toBe(false);
    expect(isWarehouseRole("developer")).toBe(false);
    expect(isWarehouseRole("")).toBe(false);
    expect(isWarehouseRole("WAREHOUSE")).toBe(false); // case-sensitive
  });
});

describe("isRestrictedRole", () => {
  it("returns true for all restricted warehouse roles", () => {
    for (const role of RESTRICTED_WAREHOUSE_ROLES) {
      expect(isRestrictedRole(role), `Expected "${role}" to be restricted`).toBe(true);
    }
  });

  it("returns false for privileged business roles", () => {
    expect(isRestrictedRole("owner")).toBe(false);
    expect(isRestrictedRole("admin")).toBe(false);
    expect(isRestrictedRole("manager")).toBe(false);
    expect(isRestrictedRole("analyst")).toBe(false);
  });
});

describe("ALLOWED_TRANSITIONS", () => {
  it("pending orders can only move to packed or shipped", () => {
    const pendingStatuses = ["pending", "Pending", "Unshipped", "PartiallyShipped"];
    for (const status of pendingStatuses) {
      expect(ALLOWED_TRANSITIONS[status]).toContain("packed");
      expect(ALLOWED_TRANSITIONS[status]).toContain("shipped");
    }
  });

  it("packed orders can only move to shipped", () => {
    expect(ALLOWED_TRANSITIONS["packed"]).toEqual(["shipped"]);
    expect(ALLOWED_TRANSITIONS["Packed"]).toEqual(["shipped"]);
  });

  it("packed orders cannot be moved back to pending", () => {
    expect(ALLOWED_TRANSITIONS["packed"]).not.toContain("pending");
    expect(ALLOWED_TRANSITIONS["Packed"]).not.toContain("Unshipped");
  });

  it("shipped orders have no further transitions defined", () => {
    expect(ALLOWED_TRANSITIONS["shipped"]).toBeUndefined();
    expect(ALLOWED_TRANSITIONS["Shipped"]).toBeUndefined();
  });
});

describe("WAREHOUSE_VISIBLE_STATUSES", () => {
  it("includes pending statuses", () => {
    expect(WAREHOUSE_VISIBLE_STATUSES).toContain("pending");
    expect(WAREHOUSE_VISIBLE_STATUSES).toContain("Unshipped");
    expect(WAREHOUSE_VISIBLE_STATUSES).toContain("PartiallyShipped");
  });

  it("includes packed status", () => {
    expect(WAREHOUSE_VISIBLE_STATUSES).toContain("packed");
  });

  it("does not include shipped (shipped orders leave warehouse queue)", () => {
    expect(WAREHOUSE_VISIBLE_STATUSES).not.toContain("shipped");
    expect(WAREHOUSE_VISIBLE_STATUSES).not.toContain("Shipped");
  });
});

describe("StatusUpdateSchema (Zod validation)", () => {
  it("accepts valid 'packed' status", () => {
    const result = StatusUpdateSchema.safeParse({ newStatus: "packed" });
    expect(result.success).toBe(true);
  });

  it("accepts valid 'shipped' status", () => {
    const result = StatusUpdateSchema.safeParse({ newStatus: "shipped" });
    expect(result.success).toBe(true);
  });

  it("accepts optional note within limit", () => {
    const result = StatusUpdateSchema.safeParse({
      newStatus: "packed",
      note: "Packed by Raj",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBe("Packed by Raj");
  });

  it("rejects invalid status strings", () => {
    expect(StatusUpdateSchema.safeParse({ newStatus: "pending" }).success).toBe(false);
    expect(StatusUpdateSchema.safeParse({ newStatus: "Shipped" }).success).toBe(false);
    expect(StatusUpdateSchema.safeParse({ newStatus: "" }).success).toBe(false);
  });

  it("rejects note longer than 500 characters", () => {
    const result = StatusUpdateSchema.safeParse({
      newStatus: "packed",
      note: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts note exactly 500 characters (boundary)", () => {
    const result = StatusUpdateSchema.safeParse({
      newStatus: "packed",
      note: "x".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing newStatus", () => {
    const result = StatusUpdateSchema.safeParse({ note: "test" });
    expect(result.success).toBe(false);
  });
});
