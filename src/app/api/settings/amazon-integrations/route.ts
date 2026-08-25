import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import { saveCredential } from "@/lib/integrations/credentials";
import type { AmazonProvider } from "@/lib/amazon/credentials";

const providerSchema = z.enum(["amazon_sp_api", "amazon_ads"]);
const configurationSchema = z.object({
  provider: providerSchema,
  accountId: z.string().uuid().optional(),
  marketplaceId: z.string().trim().min(5).max(50).default("A21TJRUUN4KGV"),
  sellerAccountId: z.string().trim().min(3).max(100),
  region: z.enum(["India", "North America", "Europe", "Far East"]).default("India"),
  displayName: z.string().trim().min(1).max(120).default("Amazon India"),
  clientId: z.string().trim().min(10).max(500).optional(),
  clientSecret: z.string().trim().min(10).max(1_000).optional(),
  refreshToken: z.string().trim().min(20).max(5_000).optional(),
  applicationId: z.string().trim().min(5).max(500).optional(),
  adsProfileId: z.string().trim().min(3).max(200).optional(),
}).strict().refine(
  (value) => Boolean(value.accountId || (value.marketplaceId && value.sellerAccountId)),
  "A marketplace account is required.",
);

const deleteSchema = z.object({
  provider: providerSchema,
  accountId: z.string().uuid(),
}).strict();

function providerCapability(provider: AmazonProvider) {
  return provider === "amazon_ads" ? "advertising" : "selling_partner";
}

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");

    const [{ data: accounts, error: accountError }, { data: credentials, error: credentialError }] =
      await Promise.all([
        actor.supabaseAdmin
          .from("marketplace_accounts")
          .select("id, platform, region, marketplace_id, seller_account_id, display_name, status, capabilities, connection_metadata, authorization_expires_at, last_healthy_at, last_error_code, updated_at")
          .eq("workspace_id", actor.workspaceId)
          .eq("platform", "amazon")
          .order("created_at", { ascending: true }),
        actor.supabaseAdmin
          .from("integration_credentials")
          .select("marketplace_account_id, provider, credential_kind, fingerprint, expires_at, updated_at")
          .eq("workspace_id", actor.workspaceId)
          .in("provider", ["amazon_sp_api", "amazon_ads"]),
      ]);

    if (accountError || credentialError) throw accountError ?? credentialError;
    return NextResponse.json({
      data: (accounts ?? []).map((account) => ({
        ...account,
        credentials: (credentials ?? []).filter(
          (credential) => credential.marketplace_account_id === account.id,
        ),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = configurationSchema.parse(await request.json());

    let account;
    if (input.accountId) {
      const { data, error } = await actor.supabaseAdmin
        .from("marketplace_accounts")
        .update({
          region: input.region,
          marketplace_id: input.marketplaceId,
          seller_account_id: input.sellerAccountId,
          display_name: input.displayName,
          connection_metadata: input.adsProfileId ? { adsProfileId: input.adsProfileId } : {},
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", actor.workspaceId)
        .eq("id", input.accountId)
        .select("id, capabilities, connection_metadata")
        .single();
      if (error) throw error;
      account = data;
    } else {
      const { data, error } = await actor.supabaseAdmin
        .from("marketplace_accounts")
        .upsert({
          workspace_id: actor.workspaceId,
          platform: "amazon",
          region: input.region,
          marketplace_id: input.marketplaceId,
          seller_account_id: input.sellerAccountId,
          display_name: input.displayName,
          status: input.refreshToken ? "active" : "pending",
          capabilities: [providerCapability(input.provider)],
          connection_metadata: input.adsProfileId ? { adsProfileId: input.adsProfileId } : {},
          created_by: actor.userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,platform,marketplace_id,seller_account_id" })
        .select("id, capabilities, connection_metadata")
        .single();
      if (error) throw error;
      account = data;
    }

    const capability = providerCapability(input.provider);
    const capabilities = Array.from(new Set([...(account.capabilities ?? []), capability]));
    const metadata = {
      ...(account.connection_metadata ?? {}),
      ...(input.adsProfileId ? { adsProfileId: input.adsProfileId } : {}),
    };
    await actor.supabaseAdmin
      .from("marketplace_accounts")
      .update({
        capabilities,
        connection_metadata: metadata,
        ...(input.refreshToken ? { status: "active", last_error_code: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", actor.workspaceId)
      .eq("id", account.id);

    const secrets = [
      ["lwa_client_id", input.clientId],
      ["lwa_client_secret", input.clientSecret],
      ["refresh_token", input.refreshToken],
      ["application_id", input.applicationId],
    ] as const;
    const saved: Array<{ id: string; fingerprint: string }> = [];
    for (const [credentialKind, secret] of secrets) {
      if (!secret) continue;
      saved.push(await saveCredential(actor.supabaseAdmin, {
        workspaceId: actor.workspaceId,
        marketplaceAccountId: account.id,
        provider: input.provider,
        credentialKind,
        secret,
      }));
    }

    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "amazon_integration.configured",
      resource_type: "marketplace_account",
      resource_id: account.id,
      new_state: {
        provider: input.provider,
        marketplaceId: input.marketplaceId,
        credentialsRotated: saved.length,
      },
      source: "settings_api",
    });

    return NextResponse.json({
      data: {
        accountId: account.id,
        provider: input.provider,
        configured: true,
        credentialsRotated: saved.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid Amazon integration settings.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = deleteSchema.parse(await request.json());
    const { data: account, error: accountError } = await actor.supabaseAdmin
      .from("marketplace_accounts")
      .select("id, capabilities")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", input.accountId)
      .single();
    if (accountError) throw accountError;

    const { error } = await actor.supabaseAdmin
      .from("integration_credentials")
      .delete()
      .eq("workspace_id", actor.workspaceId)
      .eq("marketplace_account_id", input.accountId)
      .eq("provider", input.provider);
    if (error) throw error;

    const remainingCapabilities = (account.capabilities ?? []).filter(
      (value: string) => value !== providerCapability(input.provider),
    );
    await actor.supabaseAdmin
      .from("marketplace_accounts")
      .update({
        capabilities: remainingCapabilities,
        status: remainingCapabilities.length === 0 ? "revoked" : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", actor.workspaceId)
      .eq("id", input.accountId);

    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "amazon_integration.disconnected",
      resource_type: "marketplace_account",
      resource_id: input.accountId,
      previous_state: { provider: input.provider },
      source: "settings_api",
    });

    return NextResponse.json({ data: { disconnected: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid disconnect request.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
