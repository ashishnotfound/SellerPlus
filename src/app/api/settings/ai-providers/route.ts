import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import { saveCredential } from "@/lib/integrations/credentials";

const providerSchema = z.enum([
  "openrouter",
  "nvidia",
  "gemini",
  "openai",
  "anthropic",
  "deepseek",
]);
const saveSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().trim().min(8).max(4096).optional(),
  modelName: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
  priority: z.number().int().min(1).max(100).default(50),
  inputCostPerMillion: z.number().finite().min(0).max(10_000).nullable().optional(),
  outputCostPerMillion: z.number().finite().min(0).max(10_000).nullable().optional(),
}).strict().refine(
  (value) => (value.inputCostPerMillion === null || value.inputCostPerMillion === undefined) ===
    (value.outputCostPerMillion === null || value.outputCostPerMillion === undefined),
  { message: "Configure both input and output token pricing, or leave both blank." },
);

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const { data, error } = await actor.supabaseAdmin
      .from("integration_credentials")
      .select("provider, fingerprint, credential_metadata, last_rotated_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("credential_kind", "api_key")
      .is("marketplace_account_id", null);
    if (error) throw error;

    return NextResponse.json({
      data: (data ?? []).map((row) => ({
        provider: row.provider,
        keyConfigured: true,
        fingerprint: row.fingerprint,
        modelName: row.credential_metadata?.modelName ?? "",
        enabled: row.credential_metadata?.enabled === true,
        priority: row.credential_metadata?.priority ?? 50,
        inputCostPerMillion: row.credential_metadata?.inputCostPerMillion ?? null,
        outputCostPerMillion: row.credential_metadata?.outputCostPerMillion ?? null,
        lastRotatedAt: row.last_rotated_at,
      })),
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = saveSchema.parse(await request.json());

    if (!input.apiKey) {
      const { data: existing, error } = await actor.supabaseAdmin
        .from("integration_credentials")
        .select("id, ciphertext, initialization_vector, authentication_tag, key_version, fingerprint")
        .eq("workspace_id", actor.workspaceId)
        .eq("provider", input.provider)
        .eq("credential_kind", "api_key")
        .is("marketplace_account_id", null)
        .maybeSingle();
      if (error) throw error;
      if (!existing) {
        return NextResponse.json(
          { error: "An API key is required for a new provider.", code: "MISSING_API_KEY" },
          { status: 400 },
        );
      }

      const { error: updateError } = await actor.supabaseAdmin
        .from("integration_credentials")
        .update({
          credential_metadata: {
            modelName: input.modelName,
            enabled: input.enabled,
            priority: input.priority,
            inputCostPerMillion: input.inputCostPerMillion ?? null,
            outputCostPerMillion: input.outputCostPerMillion ?? null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("workspace_id", actor.workspaceId);
      if (updateError) throw updateError;
    } else {
      await saveCredential(actor.supabaseAdmin, {
        workspaceId: actor.workspaceId,
        provider: input.provider,
        credentialKind: "api_key",
        secret: input.apiKey,
        metadata: {
          modelName: input.modelName,
          enabled: input.enabled,
          priority: input.priority,
          inputCostPerMillion: input.inputCostPerMillion ?? null,
          outputCostPerMillion: input.outputCostPerMillion ?? null,
        },
      });
    }

    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "ai_provider.updated",
      resource_type: "ai_provider",
      resource_id: input.provider,
      new_state: {
        modelName: input.modelName,
        enabled: input.enabled,
        priority: input.priority,
        pricingConfigured: input.inputCostPerMillion !== null && input.inputCostPerMillion !== undefined,
      },
      source: "settings",
    });

    return NextResponse.json({ data: { provider: input.provider, saved: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid AI provider configuration.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
