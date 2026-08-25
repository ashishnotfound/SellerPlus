import { z } from "zod";

// ─── Explainable Recommendation Schema ──────────────────────────────────────

const AutomationActionMappingSchema = z.object({
  automationType: z.string(),
  payload: z.record(z.any()),
  requiresApproval: z.boolean(),
  supportsRollback: z.boolean(),
});

const RecommendationLifecycleSchema = z.enum([
  "Draft", "Validated", "Pending Approval", "Approved", "Executing", "Completed", "Rolled Back", "Archived"
]);

const SimulationResultSchema = z.object({
  expectedRevenueImpact: z.number(),
  expectedProfitImpact: z.number(),
  expectedAdvertisingImpact: z.number(),
  assumptions: z.array(z.string())
});

const SimulationScenariosSchema = z.object({
  bestCase: SimulationResultSchema,
  expectedCase: SimulationResultSchema,
  worstCase: SimulationResultSchema,
  deterministicFormulaUsed: z.string()
});

const ExplainableRecommendationSchema = z.object({
  id: z.string().describe("A unique identifier for this recommendation"),
  recommendation: z.string().describe("The core actionable text of the recommendation"),
  priority: z.enum(["Critical", "High", "Medium", "Low"]),
  confidence: z.number().min(0).max(100).describe("Confidence score (Deterministic from KPI Service)"),
  confidenceReason: z.string().describe("AI explanation for the deterministic confidence score"),
  evidence: z.array(z.string()).describe("List of concrete data points supporting this recommendation"),
  sourceTables: z.array(z.string()).describe("The underlying database tables or data sources used"),
  sourceKPIs: z.array(z.string()).describe("The exact KPIs used to trigger this recommendation"),
  aiReasoning: z.string().describe("Natural language explanation of why this is recommended"),
  simulation: SimulationScenariosSchema.optional().describe("Expected business impact deterministically calculated"),
  dependencies: z.array(z.string()).describe("Array of recommendation IDs that must be executed before this one"),
  conflicts: z.array(z.string()).describe("Array of recommendation IDs that conflict with this action"),
  riskLevel: z.enum(["Low", "Medium", "High"]),
  estimatedTime: z.string().describe("Estimated human time to implement if manual"),
  lifecycle: RecommendationLifecycleSchema.optional(),
  action: AutomationActionMappingSchema.optional()
});

export type ExplainableRecommendation = z.infer<typeof ExplainableRecommendationSchema>;

// ─── Dashboard Widget Schemas ───────────────────────────────────────────────

const WidgetBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  importance: z.enum(["High", "Medium", "Low"]).describe("Helps frontend prioritize rendering order"),
});

const KPIWidgetSchema = WidgetBaseSchema.extend({
  type: z.literal("KPI"),
  dataset: z.object({
    value: z.number().finite().nullable(),
    format: z.enum(["currency", "number", "percent", "ratio"]),
    available: z.boolean(),
    source: z.string().min(1),
    asOf: z.string().datetime().nullable(),
  }).strict(),
}).strict();

const SeriesWidgetSchema = WidgetBaseSchema.extend({
  type: z.enum(["LineChart", "BarChart"]),
  dataset: z.array(z.object({ label: z.string(), value: z.number().finite() }).strict()).max(366),
}).strict();

const WidgetSchema = z.discriminatedUnion("type", [KPIWidgetSchema, SeriesWidgetSchema]);

export type Widget = z.infer<typeof WidgetSchema>;

// ─── BI Response Schema ─────────────────────────────────────────────────────

export const BIResponseSchema = z.object({
  analysisMode: z.string().describe("The mode used for this analysis, e.g., 'Store Audit'"),
  summary: z.string().describe("A concise natural language summary of the overall business context"),
  widgets: z.array(WidgetSchema),
  recommendations: z.array(ExplainableRecommendationSchema)
}).strict();

export type BIResponse = z.infer<typeof BIResponseSchema>;

// ─── Business Health Schema ──────────────────────────────────────────────────

export const BusinessHealthResponseSchema = z.object({
  available: z.boolean(),
  score: z.number().min(0).max(100).nullable().describe("Deterministic overall business health score when sufficient components are available"),
  trend: z.enum(["Improving", "Stable", "Declining", "Unavailable"]),
  components: z.object({
    revenue: z.number().min(0).max(100).nullable(),
    profitability: z.number().min(0).max(100).nullable(),
    advertising: z.number().min(0).max(100).nullable(),
    inventory: z.number().min(0).max(100).nullable(),
    goals: z.number().min(0).max(100).nullable(),
  }),
  dataCompleteness: z.number().min(0).max(100),
  methodology: z.literal("deterministic_health_v1"),
  dataWindow: z.object({ since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }) }),
  dataSources: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  limitations: z.array(z.string()),
  recommendations: z.array(ExplainableRecommendationSchema),
});

export type BusinessHealthResponse = z.infer<typeof BusinessHealthResponseSchema>;

// ─── Radar Schemas ───────────────────────────────────────────────────────────

export const RadarItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severityOrImpact: z.enum(["Critical", "High", "Medium", "Low"]).describe("Severity for risks, Impact for opportunities"),
  confidence: z.number().min(0).max(100),
  confidenceReason: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  dataSources: z.array(z.string().min(1)).min(1),
  expectedImpactValue: z.string().min(1).optional(),
  recommendedAction: ExplainableRecommendationSchema.optional()
}).strict();

export type RadarItem = z.infer<typeof RadarItemSchema>;

export const RadarResponseSchema = z.object({
  kind: z.enum(["risk", "opportunity"]),
  methodology: z.literal("deterministic_evidence_v1"),
  dataWindow: z.object({
    since: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
  }).strict(),
  dataSources: z.array(z.string().min(1)),
  limitations: z.array(z.string().min(1)),
  items: z.array(RadarItemSchema),
}).strict();

export type RadarResponse = z.infer<typeof RadarResponseSchema>;

// ─── Daily Briefing Schema ───────────────────────────────────────────────────

export const DailyBriefingSchema = z.object({
  date: z.string(),
  greeting: z.string(),
  yesterdaySummary: z.object({
    revenue: z.number(),
    profit: z.number().nullable(),
    orders: z.number(),
    topProduct: z.string().nullable(),
    worstProduct: z.string().optional(),
  }),
  advertisingSummary: z.string(),
  inventoryAlerts: z.array(z.string()),
  workerSummary: z.string().optional(),
  businessHealthScore: z.number().nullable(),
  goalProgress: z.string(),
  todaysMission: z.string(),
  recommendedActions: z.array(ExplainableRecommendationSchema),
  confidence: z.number().min(0).max(100),
  dataWindow: z.object({ since: z.string().datetime(), until: z.string().datetime(), timezone: z.literal("UTC") }),
  dataSources: z.array(z.string()),
});

export type DailyBriefing = z.infer<typeof DailyBriefingSchema>;

// ─── Business Simulator Schema ───────────────────────────────────────────────

const SimulatorImpactSchema = z.object({
  minimum: z.number().finite().nullable(),
  maximum: z.number().finite().nullable(),
  currency: z.literal("INR"),
  period: z.literal("30_days"),
  source: z.enum(["calculated", "modelled_estimate", "unavailable"]),
  basis: z.string().min(1),
});

export const SimulatorResponseSchema = z.object({
  scenarioName: z.string().min(1),
  methodology: z.literal("deterministic_assumption_model"),
  supported: z.boolean(),
  revenueImpact: SimulatorImpactSchema,
  profitImpact: SimulatorImpactSchema,
  advertisingImpact: SimulatorImpactSchema,
  inventoryImpact: z.string().min(1),
  cashFlowImpact: z.string().min(1),
  riskLevel: z.enum(["Critical", "High", "Medium", "Low"]),
  confidence: z.number().min(0).max(100),
  timelineDays: z.object({ minimum: z.number().int().nonnegative().nullable(), maximum: z.number().int().nonnegative().nullable() }),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  dataWindow: z.object({ start: z.string().datetime(), end: z.string().datetime(), days: z.number().int().positive() }),
  dataSources: z.array(z.enum(["Amazon SP-API", "Amazon Ads API", "seller-entered COGS", "calculated"])),
});

export type SimulatorResponse = z.infer<typeof SimulatorResponseSchema>;
