import { z } from "zod";

/**
 * Event Catalog
 * 
 * Defines all standard events emitted by the system, ensuring strict versioning
 * and type safety across the Event Bus.
 */

// 1. Core Base Event properties shared by all events
export const baseEventSchema = z.object({
  id: z.string().uuid().optional(), // Usually assigned by the DB
  user_id: z.string().uuid().optional(), // Nullable for system-wide events
  correlation_id: z.string(), // Links an entire chain of events/jobs together
  causation_id: z.string().optional(), // The ID of the event that directly caused this one
  created_at: z.string().optional(),
});

// 2. Specific Event Payloads

export const OrderCreatedPayloadSchema = z.object({
  order_id: z.string(),
  marketplace: z.string(),
  total_amount: z.number(),
  currency: z.string(),
  items_count: z.number(),
});

export const GoalProgressUpdatedPayloadSchema = z.object({
  goal_id: z.string(),
  progress_percentage: z.number(),
  status: z.string(),
});

export const AIRecommendationGeneratedPayloadSchema = z.object({
  recommendation_id: z.string(),
  confidence: z.number(),
  risk_level: z.string(),
  action_type: z.string(),
});

export const AIOptimizationRequestedPayloadSchema = z.object({
  target: z.string(), // e.g., 'ads', 'inventory'
  context: z.any(),
});

export const ScheduleDailyTriggeredPayloadSchema = z.object({
  date: z.string(), // ISO date string
});

export const SyncCompletedPayloadSchema = z.object({
  source: z.string(), // e.g., 'amazon_sp_api'
  records_updated: z.number(),
});

export const ReportGeneratedPayloadSchema = z.object({
  report_type: z.string(), // e.g., 'daily_health'
  content: z.any(), // The actual report content
  summary: z.string(),
});

// 3. Versioned Event Types

export const EventCatalog = {
  // Order Events
  "order.created.v1": baseEventSchema.extend({
    event_type: z.literal("order.created"),
    version: z.literal("v1"),
    payload: OrderCreatedPayloadSchema,
  }),
  
  // Goal Events
  "goal.progress_updated.v1": baseEventSchema.extend({
    event_type: z.literal("goal.progress_updated"),
    version: z.literal("v1"),
    payload: GoalProgressUpdatedPayloadSchema,
  }),

  // AI Events
  "ai.optimization.requested.v1": baseEventSchema.extend({
    event_type: z.literal("ai.optimization.requested"),
    version: z.literal("v1"),
    payload: AIOptimizationRequestedPayloadSchema,
  }),
  "ai.recommendation_generated.v1": baseEventSchema.extend({
    event_type: z.literal("ai.recommendation_generated"),
    version: z.literal("v1"),
    payload: AIRecommendationGeneratedPayloadSchema,
  }),
  
  // Schedule Events
  "schedule.daily.triggered.v1": baseEventSchema.extend({
    event_type: z.literal("schedule.daily.triggered"),
    version: z.literal("v1"),
    payload: ScheduleDailyTriggeredPayloadSchema,
  }),

  // Sync Events
  "sync.completed.v1": baseEventSchema.extend({
    event_type: z.literal("sync.completed"),
    version: z.literal("v1"),
    payload: SyncCompletedPayloadSchema,
  }),

  // Report Events
  "report.generated.v1": baseEventSchema.extend({
    event_type: z.literal("report.generated"),
    version: z.literal("v1"),
    payload: ReportGeneratedPayloadSchema,
  }),
} as const;

export type EventCatalogKeys = keyof typeof EventCatalog;

/**
 * Utility to extract the TypeScript type from a catalog key.
 * Example: `type OrderCreatedEvent = InferEvent<"order.created.v1">;`
 */
export type InferEvent<K extends EventCatalogKeys> = z.infer<typeof EventCatalog[K]>;

/**
 * Validates any raw event object against the catalog.
 */
export function validateEvent<K extends EventCatalogKeys>(
  key: K,
  rawEvent: unknown
): InferEvent<K> {
  const schema = EventCatalog[key];
  if (!schema) throw new Error(`Unknown event version key: ${key}`);
  return schema.parse(rawEvent) as InferEvent<K>;
}
