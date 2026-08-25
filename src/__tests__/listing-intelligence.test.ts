import { describe, expect, it } from "vitest";
import { draftCompletenessScore, readabilityGrade } from "@/lib/ai/copywriter";
import {
  contentCompletenessScore,
  titleReadabilityScore,
  titleStructureScore,
} from "@/lib/ai/listing-scores";

describe("deterministic listing intelligence scores", () => {
  it("scores draft field completeness without a model-supplied number", () => {
    const complete = draftCompletenessScore({
      title: "Premium Stainless Steel Water Bottle for Travel, Gym and Office Use",
      bullets: Array.from({ length: 5 }, (_, index) => `Verified seller-provided feature ${index + 1} described clearly for the buyer.`),
      description: "A".repeat(250),
      searchTerms: ["steel bottle", "travel bottle", "gym bottle"],
      attributes: { material: "steel", color: "black", size: "1 litre", style: "minimal", finish: "matte" },
    });
    const incomplete = draftCompletenessScore({ title: "Bottle", bullets: [], description: "", searchTerms: [] });

    expect(complete).toBe(100);
    expect(incomplete).toBe(0);
  });

  it("uses deterministic structure and readability heuristics", () => {
    const safeTitle = "Premium Stainless Steel Insulated Water Bottle for Travel Gym Office and Outdoor Use, Matte Black, One Litre";
    const unsafeTitle = "#1 BEST FREE SALE";

    expect(titleStructureScore(safeTitle)).toBeGreaterThan(titleStructureScore(unsafeTitle));
    expect(titleReadabilityScore(safeTitle)).toBeGreaterThanOrEqual(0);
    expect(readabilityGrade("Simple words make this sentence easy to read.")).toBeGreaterThan(0);
  });

  it("does not award unavailable content", () => {
    expect(contentCompletenessScore([], "")).toBe(0);
    expect(contentCompletenessScore(Array.from({ length: 5 }, () => "A sufficiently descriptive bullet for the product."), "A".repeat(250))).toBe(100);
  });
});
