/**
 * SellerPlus OS — AI Circuit Breaker & Resilience Store
 * 
 * Implements a swappable PostgreSQL-backed three-state circuit breaker
 * (Closed -> Open -> Half-Open -> Closed).
 */

import { getAdminClient } from "@/lib/auth-middleware";
import { config } from "@/lib/config";

export type CircuitState = "closed" | "open" | "half-open";

export interface ProviderStatus {
  state: CircuitState;
  failureCount: number;
  trippedAt: Date | null;
}

export interface ResilienceStore {
  getProviderStatus(providerModel: string): Promise<ProviderStatus>;
  recordSuccess(providerModel: string): Promise<void>;
  recordFailure(providerModel: string): Promise<CircuitState>;
}

export class DbResilienceStore implements ResilienceStore {
  async getProviderStatus(providerModel: string): Promise<ProviderStatus> {
    const adminClient = getAdminClient();
    const cooldownMs = config.ai.cooldownMs;

    const { data, error } = await adminClient
      .from("ai_resilience_states")
      .select("state, failure_count, tripped_at")
      .eq("provider_model", providerModel)
      .maybeSingle();

    if (error || !data) {
      // Default to Closed if no state is recorded yet
      return { state: "closed", failureCount: 0, trippedAt: null };
    }

    const state = data.state as CircuitState;
    const failureCount = data.failure_count || 0;
    const trippedAt = data.tripped_at ? new Date(data.tripped_at) : null;

    // Transition Open -> Half-Open if cooldown has elapsed
    if (state === "open" && trippedAt) {
      const elapsed = Date.now() - trippedAt.getTime();
      if (elapsed >= cooldownMs) {
        // Update state in DB to half-open
        await adminClient
          .from("ai_resilience_states")
          .update({ 
            state: "half-open", 
            updated_at: new Date().toISOString() 
          })
          .eq("provider_model", providerModel);

        return { state: "half-open", failureCount, trippedAt };
      }
    }

    return { state, failureCount, trippedAt };
  }

  async recordSuccess(providerModel: string): Promise<void> {
    const adminClient = getAdminClient();
    
    // Reset status on success (Closed)
    await adminClient
      .from("ai_resilience_states")
      .upsert({
        provider_model: providerModel,
        state: "closed",
        failure_count: 0,
        tripped_at: null,
        last_request_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
  }

  async recordFailure(providerModel: string): Promise<CircuitState> {
    const adminClient = getAdminClient();
    const threshold = config.ai.failureThreshold;

    const current = await this.getProviderStatus(providerModel);
    let nextState: CircuitState = "closed";
    let nextFailureCount = current.failureCount + 1;
    let nextTrippedAt: string | null = null;

    if (current.state === "closed") {
      if (nextFailureCount >= threshold) {
        nextState = "open";
        nextTrippedAt = new Date().toISOString();
      } else {
        nextState = "closed";
      }
    } else if (current.state === "half-open") {
      // In half-open state, a single failure immediately trips back to open
      nextState = "open";
      nextTrippedAt = new Date().toISOString();
    } else {
      // In open state, reset tripped_at to refresh the cooldown window
      nextState = "open";
      nextTrippedAt = new Date().toISOString();
    }

    await adminClient
      .from("ai_resilience_states")
      .upsert({
        provider_model: providerModel,
        state: nextState,
        failure_count: nextFailureCount,
        tripped_at: nextTrippedAt,
        last_request_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    return nextState;
  }
}

// Global resilience store instance
export const resilienceStore = new DbResilienceStore();
