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

const WidgetTypeSchema = z.enum(["LineChart", "BarChart", "PieChart", "KPI", "Table", "Alert", "Forecast"]);

const WidgetSchema = z.object({
  id: z.string(),
  type: WidgetTypeSchema,
  title: z.string(),
  description: z.string().describe("AI generated description of what this widget means"),
  importance: z.enum(["High", "Medium", "Low"]).describe("Helps frontend prioritize rendering order"),
  dataset: z.any().describe("Raw structured data payload for the widget (No styling info allowed)")
});

export type Widget = z.infer<typeof WidgetSchema>;

// ─── BI Response Schema ─────────────────────────────────────────────────────

export const BIResponseSchema = z.object({
  analysisMode: z.string().describe("The mode used for this analysis, e.g., 'Store Audit'"),
  summary: z.string().describe("A concise natural language summary of the overall business context"),
  widgets: z.array(WidgetSchema),
  recommendations: z.array(ExplainableRecommendationSchema)
});

export type BIResponse = z.infer<typeof BIResponseSchema>;

// ─── Business Health Schema ──────────────────────────────────────────────────

export const BusinessHealthResponseSchema = z.object({
  score: z.number().min(0).max(100).describe("Overall business health score (0-100)"),
  trend: z.enum(["Improving", "Stable", "Declining"]).describe("Direction of the health score"),
  components: z.object({
    revenue: z.number().min(0).max(100).describe("Revenue component score"),
    profitability: z.number().min(0).max(100).describe("Profitability component score"),
    advertising: z.number().min(0).max(100).describe("Advertising efficiency component score"),
    inventory: z.number().min(0).max(100).describe("Inventory health component score"),
    goals: z.number().min(0).max(100).describe("Goal progress component score"),
  }),
  strengths: z.array(z.string()).describe("List of business strengths"),
  weaknesses: z.array(z.string()).describe("List of business weaknesses/risks"),
  recommendations: z.array(ExplainableRecommendationSchema)
});

export type BusinessHealthResponse = z.infer<typeof BusinessHealthResponseSchema>;

// ─── Radar Schemas ───────────────────────────────────────────────────────────

export const RadarItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severityOrImpact: z.enum(["Critical", "High", "Medium", "Low"]).describe("Severity for risks, Impact for opportunities"),
  confidence: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  expectedImpactValue: z.string().optional().describe("E.g., '-₹10,000' or '+15% Sales'"),
  recommendedAction: ExplainableRecommendationSchema.optional()
});

export type RadarItem = z.infer<typeof RadarItemSchema>;

export const RadarResponseSchema = z.object({
  items: z.array(RadarItemSchema)
});

export type RadarResponse = z.infer<typeof RadarResponseSchema>;

// ─── Daily Briefing Schema ───────────────────────────────────────────────────

export const DailyBriefingSchema = z.object({
  date: z.string(),
  greeting: z.string(),
  yesterdaySummary: z.object({
    revenue: z.number(),
    profit: z.number(),
    orders: z.number(),
    topProduct: z.string(),
    worstProduct: z.string().optional(),
  }),
  advertisingSummary: z.string(),
  inventoryAlerts: z.array(z.string()),
  workerSummary: z.string().optional(),
  businessHealthScore: z.number(),
  goalProgress: z.string(),
  todaysMission: z.string(),
  recommendedActions: z.array(ExplainableRecommendationSchema),
  confidence: z.number().min(0).max(100)
});

export type DailyBriefing = z.infer<typeof DailyBriefingSchema>;

// ─── Business Simulator Schema ───────────────────────────────────────────────

export const SimulatorResponseSchema = z.object({
  scenarioName: z.string(),
  expectedRevenueImpact: z.number().describe("Expected change in monthly revenue"),
  expectedProfitImpact: z.number().describe("Expected change in monthly profit"),
  expectedAdvertisingImpact: z.number().describe("Expected change in advertising spend/efficiency"),
  inventoryImpact: z.string().describe("How this affects inventory levels/needs"),
  cashFlowImpact: z.string(),
  riskLevel: z.enum(["Critical", "High", "Medium", "Low"]),
  confidence: z.number().min(0).max(100),
  timelineDays: z.number().describe("Expected days to see the result"),
  assumptions: z.array(z.string()).describe("List of assumptions made by the simulator")
});

export type SimulatorResponse = z.infer<typeof SimulatorResponseSchema>;

