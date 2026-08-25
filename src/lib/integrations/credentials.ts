import type { SupabaseClient } from "@supabase/supabase-js";
import { credentialFingerprint, decryptToken, encryptToken } from "@/lib/encryption";

export interface StoredCredential {
  id: string;
  provider: string;
  credentialKind: string;
  secret: string;
  fingerprint: string | null;
  metadata: Record<string, unknown>;
  keyVersion: string;
  expiresAt: string | null;
}

interface SaveCredentialInput {
  workspaceId: string;
  marketplaceAccountId?: string | null;
  provider: string;
  credentialKind: string;
  secret: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}

function unpackEnvelope(envelope: string) {
  const [prefix, formatVersion, keyVersion, initializationVector, authenticationTag, ciphertext] =
    envelope.split(":");
  if (
    prefix !== "spenc" ||
    formatVersion !== "1" ||
    !keyVersion ||
    !initializationVector ||
    !authenticationTag ||
    !ciphertext
  ) {
    throw new Error("Unable to persist an unsupported credential envelope.");
  }
  return { keyVersion, initializationVector, authenticationTag, ciphertext };
}

function packEnvelope(row: {
  key_version: string;
  initialization_vector: string;
  authentication_tag: string;
  ciphertext: string;
}) {
  return [
    "spenc",
    "1",
    row.key_version,
    row.initialization_vector,
    row.authentication_tag,
    row.ciphertext,
  ].join(":");
}

export async function saveCredential(
  admin: SupabaseClient,
  input: SaveCredentialInput,
): Promise<{ id: string; fingerprint: string }> {
  const envelope = unpackEnvelope(encryptToken(input.secret));
  const fingerprint = credentialFingerprint(input.secret);
  let existingQuery = admin
    .from("integration_credentials")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", input.provider)
    .eq("credential_kind", input.credentialKind);
  existingQuery = input.marketplaceAccountId
    ? existingQuery.eq("marketplace_account_id", input.marketplaceAccountId)
    : existingQuery.is("marketplace_account_id", null);
  const { data: existing, error: readError } = await existingQuery.maybeSingle();
  if (readError) throw readError;

  const record = {
    workspace_id: input.workspaceId,
    marketplace_account_id: input.marketplaceAccountId ?? null,
    provider: input.provider,
    credential_kind: input.credentialKind,
    ciphertext: envelope.ciphertext,
    initialization_vector: envelope.initializationVector,
    authentication_tag: envelope.authenticationTag,
    key_version: envelope.keyVersion,
    fingerprint,
    credential_metadata: input.metadata ?? {},
    expires_at: input.expiresAt ?? null,
    last_rotated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = existing
    ? await admin
        .from("integration_credentials")
        .update(record)
        .eq("id", existing.id)
        .eq("workspace_id", input.workspaceId)
        .select("id")
        .single()
    : await admin.from("integration_credentials").insert(record).select("id").single();
  if (result.error || !result.data) throw result.error ?? new Error("Credential save failed.");

  return { id: result.data.id, fingerprint };
}

export async function readCredential(
  admin: SupabaseClient,
  input: Omit<SaveCredentialInput, "secret" | "metadata" | "expiresAt">,
): Promise<StoredCredential | null> {
  let query = admin
    .from("integration_credentials")
    .select("id, provider, credential_kind, ciphertext, initialization_vector, authentication_tag, key_version, fingerprint, credential_metadata, expires_at")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", input.provider)
    .eq("credential_kind", input.credentialKind);
  query = input.marketplaceAccountId
    ? query.eq("marketplace_account_id", input.marketplaceAccountId)
    : query.is("marketplace_account_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    provider: data.provider,
    credentialKind: data.credential_kind,
    secret: decryptToken(packEnvelope(data)),
    fingerprint: data.fingerprint,
    metadata: data.credential_metadata ?? {},
    keyVersion: data.key_version,
    expiresAt: data.expires_at,
  };
}
