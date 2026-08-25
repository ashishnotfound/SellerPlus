import { getAdminClient } from "@/lib/supabase/admin";
import { maximumRequestCostMicros } from "./pricing";
import type { GenerationOptions, LLMSetting } from "./types";

export class AIBudgetError extends Error {
  readonly code: string;

  constructor(message: string, code = "AI_BUDGET_BLOCKED") {
    super(message);
    this.name = "AIBudgetError";
    this.code = code;
  }
}

export function aiBudgetErrorResponse(error: unknown): { error: string; code: string; status: 429 } | null {
  return error instanceof AIBudgetError
    ? { error: error.message, code: error.code, status: 429 }
    : null;
}

export async function reserveAIRequestBudget(input: {
  workspaceId: string;
  correlationId: string;
  setting: LLMSetting;
  prompt: string;
  options?: GenerationOptions;
  attempts: number;
}): Promise<void> {
  const maximumOutputTokens = input.options?.maxTokens ?? 2_048;
  const estimatedTokens = (Math.ceil(input.prompt.length / 4) + maximumOutputTokens) * input.attempts;
  const singleAttemptCostMicros = maximumRequestCostMicros(
    input.setting,
    input.prompt,
    maximumOutputTokens,
  );
  const estimatedCostMicros = singleAttemptCostMicros === null
    ? null
    : singleAttemptCostMicros * input.attempts;
  const { data, error } = await getAdminClient().rpc("reserve_workspace_ai_budget", {
    p_workspace_id: input.workspaceId,
    p_correlation_id: input.correlationId,
    p_estimated_cost_micros: estimatedCostMicros,
    p_estimated_tokens: estimatedTokens,
  });
  if (error) throw new Error("SellerPlus could not verify the workspace AI budget.");
  const decision = data as { allowed?: boolean; code?: string; reason?: string } | null;
  if (decision?.allowed === false) {
    throw new AIBudgetError(
      decision.reason ?? "The workspace AI budget blocked this request.",
      decision.code ?? "AI_BUDGET_BLOCKED",
    );
  }
}
