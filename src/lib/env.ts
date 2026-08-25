import { z } from "zod";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const publicSupabaseSchema = z.object({
  url: z.string().url(),
  publishableKey: z.string().min(20),
});

const serverSupabaseSchema = publicSupabaseSchema.extend({
  secretKey: z.string().min(20),
});

export type PublicSupabaseConfig = z.infer<typeof publicSupabaseSchema>;
export type ServerSupabaseConfig = z.infer<typeof serverSupabaseSchema>;

function formatIssues(scope: string, error: z.ZodError): ConfigurationError {
  const fields = error.issues.map((issue) => issue.path.join(".")).join(", ");
  return new ConfigurationError(`${scope} is not configured correctly (${fields}).`);
}

/**
 * Resolve browser-safe Supabase configuration at call time.
 *
 * Keeping validation lazy lets `next build` collect route metadata without
 * requiring production credentials. Any request that actually needs Supabase
 * still fails closed with an actionable configuration error.
 */
export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const result = publicSupabaseSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    throw formatIssues("Public Supabase configuration", result.error);
  }

  return result.data;
}

/** Resolve server-only Supabase configuration. Never import this into a Client Component. */
export function getServerSupabaseConfig(): ServerSupabaseConfig {
  const publicConfig = getPublicSupabaseConfig();
  const result = serverSupabaseSchema.safeParse({
    ...publicConfig,
    secretKey:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    throw formatIssues("Server Supabase configuration", result.error);
  }

  return result.data;
}

export function isExplicitInsecureDevMode(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.SELLERPLUS_ALLOW_INSECURE_DEV_AUTH === "true"
  );
}

