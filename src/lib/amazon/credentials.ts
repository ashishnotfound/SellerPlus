import type { SupabaseClient } from "@supabase/supabase-js";
import { readCredential } from "@/lib/integrations/credentials";

export type AmazonProvider = "amazon_sp_api" | "amazon_ads";

export interface AmazonMarketplaceAccount {
  id: string;
  workspaceId: string;
  region: string;
  marketplaceId: string;
  sellerAccountId: string;
  displayName: string;
  status: "pending" | "active" | "expired" | "revoked" | "error";
  capabilities: string[];
  metadata: Record<string, unknown>;
}

export interface AmazonCredentialSet {
  clientId: string;
  clientSecret: string;
  refreshToken: string | null;
  applicationId: string | null;
}

function asAccount(row: Record<string, unknown>): AmazonMarketplaceAccount {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    region: String(row.region),
    marketplaceId: String(row.marketplace_id),
    sellerAccountId: String(row.seller_account_id),
    displayName: String(row.display_name),
    status: row.status as AmazonMarketplaceAccount["status"],
    capabilities: Array.isArray(row.capabilities)
      ? row.capabilities.filter((value): value is string => typeof value === "string")
      : [],
    metadata:
      row.connection_metadata && typeof row.connection_metadata === "object"
        ? (row.connection_metadata as Record<string, unknown>)
        : {},
  };
}

export async function getAmazonMarketplaceAccount(
  admin: SupabaseClient,
  workspaceId: string,
  accountId?: string,
): Promise<AmazonMarketplaceAccount> {
  let query = admin
    .from("marketplace_accounts")
    .select("id, workspace_id, region, marketplace_id, seller_account_id, display_name, status, capabilities, connection_metadata")
    .eq("workspace_id", workspaceId)
    .eq("platform", "amazon")
    .neq("status", "revoked");

  if (accountId) query = query.eq("id", accountId);
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No active Amazon marketplace account is configured.");
  return asAccount(data);
}

async function optionalCredential(
  admin: SupabaseClient,
  workspaceId: string,
  marketplaceAccountId: string,
  provider: AmazonProvider,
  credentialKind: string,
): Promise<string | null> {
  const stored = await readCredential(admin, {
    workspaceId,
    marketplaceAccountId,
    provider,
    credentialKind,
  });
  return stored?.secret ?? null;
}

export async function readAmazonCredentialSet(
  admin: SupabaseClient,
  workspaceId: string,
  marketplaceAccountId: string,
  provider: AmazonProvider,
): Promise<AmazonCredentialSet> {
  const [storedClientId, storedClientSecret, refreshToken, storedApplicationId] =
    await Promise.all([
      optionalCredential(admin, workspaceId, marketplaceAccountId, provider, "lwa_client_id"),
      optionalCredential(admin, workspaceId, marketplaceAccountId, provider, "lwa_client_secret"),
      optionalCredential(admin, workspaceId, marketplaceAccountId, provider, "refresh_token"),
      optionalCredential(admin, workspaceId, marketplaceAccountId, provider, "application_id"),
    ]);

  const isAds = provider === "amazon_ads";
  const clientId =
    storedClientId ??
    (isAds
      ? process.env.AMAZON_ADS_CLIENT_ID ?? process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID
      : process.env.AMAZON_SP_CLIENT_ID ?? process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID);
  const clientSecret =
    storedClientSecret ??
    (isAds ? process.env.AMAZON_ADS_CLIENT_SECRET : process.env.AMAZON_SP_CLIENT_SECRET);
  const applicationId =
    storedApplicationId ?? (isAds ? null : process.env.AMAZON_SP_APPLICATION_ID ?? null);

  if (!clientId || !clientSecret) {
    throw new Error(
      `${isAds ? "Amazon Ads" : "Amazon SP-API"} application credentials are not configured.`,
    );
  }

  return { clientId, clientSecret, refreshToken, applicationId };
}

export async function exchangeLwaRefreshToken(
  credentials: Pick<AmazonCredentialSet, "clientId" | "clientSecret" | "refreshToken">,
): Promise<string> {
  if (!credentials.refreshToken) {
    throw new Error("Amazon authorization is incomplete. Reconnect the account.");
  }

  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      response.status === 400 || response.status === 401
        ? "Amazon authorization has expired or was revoked. Reconnect the account."
        : `Amazon authorization is temporarily unavailable (HTTP ${response.status}).`,
    );
  }

  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== "string" || payload.access_token.length < 20) {
    throw new Error("Amazon returned an invalid authorization response.");
  }
  return payload.access_token;
}
