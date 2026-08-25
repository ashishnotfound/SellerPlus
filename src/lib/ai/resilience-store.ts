import { getAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";

export type CircuitState = "closed" | "open" | "half-open";

export interface ProviderStatus {
  state: CircuitState;
  failureCount: number;
  trippedAt: Date | null;
}

export class DbResilienceStore {
  async getProviderStatus(workspaceId: string, providerModel: string): Promise<ProviderStatus> {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("ai_resilience_states")
      .select("state, failure_count, tripped_at")
      .eq("workspace_id", workspaceId)
      .eq("provider_model", providerModel)
      .maybeSingle();
    if (error || !data) return { state: "closed", failureCount: 0, trippedAt: null };

    const state = data.state as CircuitState;
    const failureCount = data.failure_count ?? 0;
    const trippedAt = data.tripped_at ? new Date(data.tripped_at) : null;
    if (state === "open" && trippedAt && Date.now() - trippedAt.getTime() >= config.ai.cooldownMs) {
      await admin
        .from("ai_resilience_states")
        .update({ state: "half-open", updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("provider_model", providerModel);
      return { state: "half-open", failureCount, trippedAt };
    }
    return { state, failureCount, trippedAt };
  }

  async recordSuccess(workspaceId: string, providerModel: string): Promise<void> {
    const { error } = await getAdminClient().from("ai_resilience_states").upsert({
      workspace_id: workspaceId,
      provider_model: providerModel,
      state: "closed",
      failure_count: 0,
      tripped_at: null,
      last_request_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,provider_model" });
    if (error) throw error;
  }

  async recordFailure(workspaceId: string, providerModel: string): Promise<CircuitState> {
    const current = await this.getProviderStatus(workspaceId, providerModel);
    const failureCount = current.failureCount + 1;
    const shouldOpen = current.state !== "closed" || failureCount >= config.ai.failureThreshold;
    const state: CircuitState = shouldOpen ? "open" : "closed";
    const { error } = await getAdminClient().from("ai_resilience_states").upsert({
      workspace_id: workspaceId,
      provider_model: providerModel,
      state,
      failure_count: failureCount,
      tripped_at: state === "open" ? new Date().toISOString() : null,
      last_request_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,provider_model" });
    if (error) throw error;
    return state;
  }
}

export const resilienceStore = new DbResilienceStore();
