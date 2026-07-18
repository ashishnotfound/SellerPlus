import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { EventCatalogKeys, InferEvent, validateEvent } from "./event-catalog";

// We use the service role key since the event bus runs server-side
// and writes to tables that normal users can't write arbitrary records to (like jobs).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * EventSubscriptionRegistry
 * Maps event catalog keys to a list of queue/worker names.
 * When an event is emitted, a job is inserted into each of these queues.
 */
export const EventSubscriptionRegistry: Record<EventCatalogKeys, string[]> = {
  "order.created.v1": ["sync_worker", "warehouse_worker"],
  "goal.progress_updated.v1": ["ai_worker"],
  "ai.optimization.requested.v1": ["ai_worker"],
  "ai.recommendation_generated.v1": ["automation_worker", "notification_worker"],
  "schedule.daily.triggered.v1": ["sync_worker"],
  "sync.completed.v1": ["report_worker"],
  "report.generated.v1": ["notification_worker"],
};

export interface EmitOptions {
  causation_id?: string;
  correlation_id?: string;
  user_id?: string;
}

/**
 * Emits an event to the ledger and fans out jobs to subscribers.
 */
export async function emitEvent<K extends EventCatalogKeys>(
  key: K,
  payload: InferEvent<K>["payload"],
  options: EmitOptions = {}
): Promise<{ success: boolean; eventId?: string; error?: any }> {
  try {
    const eventType = key.split(".v")[0];
    const version = "v" + key.split(".v")[1];

    const correlationId = options.correlation_id || uuidv4();
    const eventId = uuidv4();

    const rawEvent = {
      id: eventId,
      user_id: options.user_id,
      event_type: eventType,
      version: version,
      payload: payload,
      correlation_id: correlationId,
      causation_id: options.causation_id,
    };

    // 1. Validate payload matches catalog
    validateEvent(key, rawEvent);

    // 2. Insert into event ledger
    const { error: eventError } = await supabase
      .from("events")
      .insert(rawEvent);

    if (eventError) {
      throw eventError;
    }

    // 3. Fan-out to jobs based on subscription registry
    const subscribers = EventSubscriptionRegistry[key] || [];
    
    if (subscribers.length > 0) {
      const jobsToInsert = subscribers.map((queueName) => ({
        job_type: queueName,
        idempotency_key: `${queueName}-${eventId}`,
        payload: rawEvent,
        status: "pending",
        correlation_id: correlationId,
      }));

      const { error: jobsError } = await supabase
        .from("jobs")
        .insert(jobsToInsert);

      if (jobsError) {
        console.error(`[EventBus] Failed to enqueue jobs for event ${key}: ${jobsError.message}`);
      }
    }

    return { success: true, eventId };
  } catch (error) {
    console.error(`Failed to emit event ${key}:`, error);
    return { success: false, error };
  }
}
