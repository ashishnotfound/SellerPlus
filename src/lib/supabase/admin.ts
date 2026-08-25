import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseConfig } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Server-only service client. It bypasses RLS, so callers must authenticate and
 * apply workspace predicates before every tenant-scoped query.
 */
export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const { url, secretKey } = getServerSupabaseConfig();
  adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}

