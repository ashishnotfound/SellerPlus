import { SimulatorResponse, SimulatorResponseSchema } from "./schemas";
import { BIRepository, type BusinessSummary } from "@/lib/repositories/bi-repository";
import { log } from "@/lib/logger";

type ScenarioDomain = "advertising" | "cogs" | "amazon_fees";

interface ParsedScenario {
  domain: ScenarioDomain;
  direction: 1 | -1;
  percentage: number;
}

function parseScenario(value: string): ParsedScenario | null {
  const scenario = value.toLowerCase();
  const percentageMatch = scenario.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
  if (!percentageMatch) return null;
  const percentage = Number(percentageMatch[1]);
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return null;

  const increases = /\b(increase|raise|boost|scale|grow|higher)\b/.test(scenario);
  const decreases = /\b(decrease|reduce|cut|lower|drop|save)\b/.test(scenario);
  if (increases === decreases) return null;
  const direction: 1 | -1 = increases ? 1 : -1;

  if (/\b(ad spend|advertising spend|ppc spend|campaign budget|ad budget)\b/.test(scenario)) {
    return { domain: "advertising", direction, percentage };
  }
  if (/\b(cogs|cost of goods|production cost|product cost)\b/.test(scenario)) {
    return { domain: "cogs", direction, percentage };
  }
  if (/\b(amazon fees?|fba fees?|fulfilment fees?|fulfillment fees?|commission fees?)\b/.test(scenario)) {
    return { domain: "amazon_fees", direction, percentage };
  }
  return null;
}

function moneyRange(
  minimum: number | null,
  maximum: number | null,
  source: "calculated" | "modelled_estimate" | "unavailable",
  basis: string,
) {
  const round = (value: number | null) => value === null ? null : Math.round(value * 100) / 100;
  return {
    minimum: round(minimum),
    maximum: round(maximum),
    currency: "INR" as const,
    period: "30_days" as const,
    source,
    basis,
  };
}

function unavailable(basis: string) {
  return moneyRange(null, null, "unavailable", basis);
}

function riskFor(percentage: number): "Critical" | "High" | "Medium" | "Low" {
  if (percentage > 50) return "Critical";
  if (percentage > 25) return "High";
  if (percentage > 10) return "Medium";
  return "Low";
}

function buildSupportedResult(
  scenarioName: string,
  parsed: ParsedScenario,
  summary: BusinessSummary,
  start: Date,
  end: Date,
): SimulatorResponse {
  const ratio = parsed.percentage / 100;
  const signedRatio = parsed.direction * ratio;
  const verb = parsed.direction > 0 ? "increase" : "decrease";
  const base = {
    scenarioName,
    methodology: "deterministic_assumption_model" as const,
    supported: true,
    inventoryImpact: "Inventory impact cannot be quantified without SKU-level demand and replenishment inputs.",
    cashFlowImpact: "Cash-flow timing is not quantified because settlement timing, tax, and payment schedules are not present in this aggregate.",
    riskLevel: riskFor(parsed.percentage),
    confidence: 0,
    timelineDays: { minimum: 1, maximum: 30 },
    assumptions: [] as string[],
    limitations: ["This is a what-if model, not a forecast or a guarantee."],
    dataWindow: { start: start.toISOString(), end: end.toISOString(), days: 30 },
    dataSources: ["calculated" as const],
  };

  if (parsed.domain === "advertising") {
    const spendDelta = summary.ads.totalSpend * signedRatio;
    const proportionalSalesDelta = summary.ads.totalSales * signedRatio;
    const revenueMinimum = parsed.direction > 0 ? 0 : proportionalSalesDelta * 1.5;
    const revenueMaximum = parsed.direction > 0 ? proportionalSalesDelta : proportionalSalesDelta * 0.5;
    return SimulatorResponseSchema.parse({
      ...base,
      confidence: summary.ads.totalSpend > 0 && summary.ads.totalSales > 0 ? 35 : 10,
      revenueImpact: summary.ads.totalSales > 0
        ? moneyRange(Math.min(revenueMinimum, revenueMaximum), Math.max(revenueMinimum, revenueMaximum), "modelled_estimate", `Sensitivity range around the last 30 days of Ads-attributed sales for a ${parsed.percentage}% ${verb}.`)
        : unavailable("No Ads-attributed sales baseline is available."),
      profitImpact: unavailable("Profit impact requires marginal conversion, product COGS, returns, and fee data by advertised SKU."),
      advertisingImpact: summary.ads.totalSpend > 0
        ? moneyRange(spendDelta, spendDelta, "calculated", `${parsed.percentage}% of the last 30 days of recorded Amazon Ads spend.`)
        : unavailable("No Amazon Ads spend baseline is available."),
      assumptions: [
        `The requested ${parsed.percentage}% ${verb} is applied to the recorded 30-day Ads spend.`,
        "Revenue sensitivity is shown as a broad range; it is not treated as a causal forecast.",
      ],
      limitations: [...base.limitations, "Campaign-level marginal ROAS and SKU contribution margins are not available in this aggregate."],
      dataSources: ["Amazon Ads API", "calculated"],
    });
  }

  const baseline = parsed.domain === "cogs"
    ? summary.cogs.totalCogs
    : summary.orders.totalCommissionFees + summary.orders.totalFbaFees + summary.orders.totalShippingCost;
  const costDelta = (baseline ?? 0) * signedRatio;
  const source = parsed.domain === "cogs" ? "seller-entered COGS" as const : "Amazon SP-API" as const;
  const label = parsed.domain === "cogs" ? "COGS" : "recorded Amazon and fulfillment fees";
  return SimulatorResponseSchema.parse({
    ...base,
    confidence: baseline !== null && baseline > 0 ? 65 : 10,
    revenueImpact: moneyRange(0, 0, "calculated", "Revenue is held constant by this cost-only scenario."),
    profitImpact: baseline !== null && baseline > 0
      ? moneyRange(-costDelta, -costDelta, "calculated", `${parsed.percentage}% of last 30 days of ${label}, with sales volume held constant.`)
      : unavailable(`No ${label} baseline is available.`),
    advertisingImpact: moneyRange(0, 0, "calculated", "Advertising is held constant by this cost-only scenario."),
    assumptions: [
      `The requested ${parsed.percentage}% ${verb} is applied to the recorded 30-day ${label}.`,
      "Sales volume, mix, refunds, taxes, and all other costs are held constant.",
    ],
    limitations: [...base.limitations, "Supplier tiers, tax effects, and future order-volume changes are not modelled."],
    dataSources: [source, "calculated"],
  });
}

export function modelBusinessScenario(
  scenario: string,
  summary: BusinessSummary,
  start: Date,
  end: Date,
): SimulatorResponse {
    const parsed = parseScenario(scenario);

    if (!parsed) {
      return SimulatorResponseSchema.parse({
        scenarioName: scenario,
        methodology: "deterministic_assumption_model",
        supported: false,
        revenueImpact: unavailable("This scenario cannot be quantified from the available verified inputs."),
        profitImpact: unavailable("This scenario cannot be quantified from the available verified inputs."),
        advertisingImpact: unavailable("This scenario cannot be quantified from the available verified inputs."),
        inventoryImpact: "Not quantified.",
        cashFlowImpact: "Not quantified.",
        riskLevel: "Medium",
        confidence: 0,
        timelineDays: { minimum: null, maximum: null },
        assumptions: [],
        limitations: [
          "Use an explicit percentage change for ad spend, COGS, or Amazon fees.",
          "SellerPlus does not invent an exact financial result when the required causal inputs are unavailable.",
        ],
        dataWindow: { start: start.toISOString(), end: end.toISOString(), days: 30 },
        dataSources: ["calculated"],
      });
    }

    return buildSupportedResult(scenario, parsed, summary, start, end);
}

export class BusinessSimulator {
  static async simulate(_userId: string, workspaceId: string, scenario: string): Promise<SimulatorResponse> {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const summary = await BIRepository.getBusinessSummary(workspaceId, start);
    const result = modelBusinessScenario(scenario, summary, start, end);
    log.info("[BusinessSimulator] Deterministic scenario completed.", undefined, {
      workspaceId,
      supported: result.supported,
      confidence: result.confidence,
    });
    return result;
  }
}
