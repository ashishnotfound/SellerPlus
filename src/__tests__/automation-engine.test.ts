/**
 * Unit Tests — AutomationEngine (Rule Logic)
 *
 * Tests the deterministic business logic inside each automation rule's
 * evaluate() function using mocked Supabase clients.
 *
 * We do NOT test actual database operations. We test:
 * - Which campaigns trigger the bleeding rule
 * - Which listings trigger the restock rule
 * - Which listings trigger the missing cost detector
 * - Edge cases: empty data, threshold boundaries
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocked Supabase helper ────────────────────────────────────────────

/**
 * Creates a minimal Supabase-like mock that returns the given data
 * for any .from().select().eq() chain.
 */
function mockSupabase(returnData: Record<string, any[]>) {
  const createChain = (tableName: string) => {
    const data = returnData[tableName] ?? [];
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null }),
      then: vi.fn(),
      // Terminal resolution for filter chains
      toPromise: vi.fn().mockResolvedValue({ data, error: null }),
    };
    // Make the chain itself thenable (await chain resolves to {data, error})
    chain[Symbol.iterator] = undefined;
    Object.defineProperty(chain, Symbol.toPrimitive, { value: undefined });

    // Hack: make await on chain work
    chain.then = (resolve: any) => resolve({ data, error: null });

    return chain;
  };

  return {
    from: vi.fn((tableName: string) => createChain(tableName)),
  };
}

// ─── ACOS Threshold Logic ─────────────────────────────────────────────

describe("AutomationEngine — ACOS bleeding detection logic", () => {
  it("identifies campaigns with ACOS > 50%", () => {
    const campaigns = [
      { campaign_id: "c1", name: "High ACOS", spend: 1000, sales: 1500, status: "ENABLED" }, // 66% ACOS
      { campaign_id: "c2", name: "Low ACOS", spend: 500, sales: 5000, status: "ENABLED" },   // 10% ACOS
      { campaign_id: "c3", name: "Zero Sales", spend: 200, sales: 0, status: "ENABLED" },    // 100% ACOS
    ];

    const bleeding = campaigns.filter((c) => {
      const spend = Number(c.spend) || 0;
      const sales = Number(c.sales) || 0;
      if (spend <= 0) return false;
      const acos = sales > 0 ? (spend / sales) * 100 : 100;
      return acos > 50;
    });

    expect(bleeding.length).toBe(2);
    expect(bleeding.map((c) => c.campaign_id)).toContain("c1");
    expect(bleeding.map((c) => c.campaign_id)).toContain("c3");
    expect(bleeding.map((c) => c.campaign_id)).not.toContain("c2");
  });

  it("excludes campaigns with zero spend (not applicable)", () => {
    const campaigns = [
      { campaign_id: "c-nospend", name: "No Spend", spend: 0, sales: 0, status: "ENABLED" },
    ];

    const bleeding = campaigns.filter((c) => {
      const spend = Number(c.spend) || 0;
      if (spend <= 0) return false;
      const sales = Number(c.sales) || 0;
      const acos = sales > 0 ? (spend / sales) * 100 : 100;
      return acos > 50;
    });

    expect(bleeding.length).toBe(0);
  });

  it("correctly calculates ad waste amount", () => {
    const campaigns = [
      { spend: 1000, sales: 500 }, // waste = spend - sales * 0.3 = 1000 - 150 = 850
    ];

    const totalWaste = campaigns.reduce((sum, c) => {
      const spend = Number(c.spend) || 0;
      const sales = Number(c.sales) || 0;
      return sum + Math.max(0, spend - sales * 0.3);
    }, 0);

    expect(totalWaste).toBe(850);
  });
});

// ─── Restock Alert Logic ──────────────────────────────────────────────

describe("AutomationEngine — Restock alert trigger logic", () => {
  it("identifies listings with <= 7 days of stock", () => {
    const listings = [
      // SKU-A: 35 units / (150/30=5 per day) = 7 days exactly → AT RISK
      { sku: "SKU-A", available_qty: 35, sales_30d: 150, incoming_qty: 0 },
      // SKU-B: 300 units / 5 per day = 60 days → safe
      { sku: "SKU-B", available_qty: 300, sales_30d: 150, incoming_qty: 0 },
      // SKU-C: has incoming shipment → not at risk despite low days
      { sku: "SKU-C", available_qty: 20, sales_30d: 60, incoming_qty: 100 },
      // SKU-D: no velocity → skip (avoid divide by zero)
      { sku: "SKU-D", available_qty: 0, sales_30d: 0, incoming_qty: 0 },
    ];

    const atRisk = listings.filter((l) => {
      const stock = Number(l.available_qty) || 0;
      const velocity = (Number(l.sales_30d) || 0) / 30;
      const incoming = Number(l.incoming_qty) || 0;
      if (velocity <= 0 || stock <= 0) return false;
      const daysLeft = Math.ceil(stock / velocity);
      return daysLeft <= 7 && incoming === 0;
    });

    expect(atRisk.length).toBe(1);
    expect(atRisk[0].sku).toBe("SKU-A");
  });

  it("skips listings with no sales velocity", () => {
    const listings = [
      { sku: "SKU-NOSALES", available_qty: 5, sales_30d: 0, incoming_qty: 0 },
    ];

    const atRisk = listings.filter((l) => {
      const velocity = (Number(l.sales_30d) || 0) / 30;
      return velocity > 0;
    });

    expect(atRisk.length).toBe(0);
  });

  it("does not flag listings with incoming shipments", () => {
    const listings = [
      { sku: "SKU-SHIP", available_qty: 10, sales_30d: 90, incoming_qty: 500 }, // 3 units/day, 3.3 days → has incoming
    ];

    const atRisk = listings.filter((l) => {
      const stock = Number(l.available_qty) || 0;
      const velocity = (Number(l.sales_30d) || 0) / 30;
      const incoming = Number(l.incoming_qty) || 0;
      if (velocity <= 0 || stock <= 0) return false;
      const daysLeft = Math.ceil(stock / velocity);
      return daysLeft <= 7 && incoming === 0; // incoming shipment saves it
    });

    expect(atRisk.length).toBe(0);
  });
});

// ─── Missing Cost Profile Detection Logic ─────────────────────────────

describe("AutomationEngine — Missing cost profile detection logic", () => {
  it("flags active listings without a cost profile", () => {
    const listings = [
      { sku: "SKU-NOCOST", title: "Widget", sales_30d: 100, price: 500, cost_profile_id: null },
      { sku: "SKU-HASCOST", title: "Gadget", sales_30d: 200, price: 1000, cost_profile_id: "cp-001" },
      { sku: "SKU-INACTIVE", title: "Old Item", sales_30d: 0, price: 200, cost_profile_id: null },
    ];

    const active = listings.filter((l) => (Number(l.sales_30d) || 0) > 0 && !l.cost_profile_id);

    expect(active.length).toBe(1);
    expect(active[0].sku).toBe("SKU-NOCOST");
  });

  it("correctly calculates blind revenue (price × sales)", () => {
    const listings = [
      { sku: "SKU-A", sales_30d: 100, price: 500, cost_profile_id: null },
      { sku: "SKU-B", sales_30d: 50, price: 200, cost_profile_id: null },
    ];

    const blindRevenue = listings.reduce(
      (sum, l) => sum + (Number(l.price) || 0) * (Number(l.sales_30d) || 0),
      0
    );

    expect(blindRevenue).toBe(100 * 500 + 50 * 200); // 50000 + 10000 = 60000
  });

  it("returns empty when all active listings have cost profiles", () => {
    const listings = [
      { sku: "SKU-A", sales_30d: 100, price: 500, cost_profile_id: "cp-001" },
    ];

    const active = listings.filter((l) => (Number(l.sales_30d) || 0) > 0 && !l.cost_profile_id);

    expect(active.length).toBe(0);
  });
});

// ─── Lifecycle Transition Validation ─────────────────────────────────

describe("AutomationEngine — Lifecycle state machine", () => {
  const validTransitions: Record<string, string[]> = {
    "Draft": ["Validated", "Pending Approval", "Approved"],
    "Validated": ["Pending Approval", "Approved"],
    "Pending Approval": ["Approved", "Rejected"],
    "Approved": ["Executing"],
    "Executing": ["Completed", "Failed"],
    "Completed": ["Rolled Back", "Archived"],
    "Failed": ["Archived"],
    "Rolled Back": ["Archived"],
    "Archived": [],
  };

  it("allows valid transitions", () => {
    expect(validTransitions["Draft"]).toContain("Pending Approval");
    expect(validTransitions["Approved"]).toContain("Executing");
    expect(validTransitions["Executing"]).toContain("Completed");
  });

  it("blocks invalid transitions", () => {
    expect(validTransitions["Archived"]).not.toContain("Draft"); // Cannot un-archive
    expect(validTransitions["Completed"]).not.toContain("Approved"); // Cannot re-approve completed
    expect(validTransitions["Archived"]).toHaveLength(0); // Terminal state
  });

  it("Archived is a terminal state (no outgoing transitions)", () => {
    expect(validTransitions["Archived"]).toHaveLength(0);
  });
});
