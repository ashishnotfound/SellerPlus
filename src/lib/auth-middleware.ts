/**
 * SellerPlus OS — Authentication & Authorization Middleware
 * 
 * Enterprise-grade authentication layer for all API routes.
 * Provides JWT verification, role-based access control, admin client factory,
 * and cron secret validation — ensuring zero-trust security at every endpoint.
 * 
 * Usage:
 *   const { userId, role, supabaseAdmin } = await authenticate(request);
 *   const { supabaseAdmin } = authenticateCron(request);
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  supabaseAdmin: SupabaseClient;
}

export interface CronContext {
  supabaseAdmin: SupabaseClient;
}

export class AuthError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

// ─── Admin Client Factory ────────────────────────────────────────────

let _adminClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase admin client using the service role key.
 * This bypasses RLS and should only be used in authenticated server contexts.
 */
export function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new AuthError(
      "Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.",
      500
    );
  }

  _adminClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}

// ─── JWT Authentication ──────────────────────────────────────────────

/**
 * Extracts the Supabase access token from the request.
 * Supports both Authorization header and cookie-based sessions.
 */
function extractToken(request: Request): string | null {
  // 1. Check Authorization header (Bearer token)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // 2. Check cookie-based session (Supabase SSR)
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    })
  );

  // Supabase stores access token in sb-<ref>-auth-token cookie
  for (const [key, value] of Object.entries(cookies)) {
    if (key.includes("auth-token") && value) {
      try {
        const parsed = JSON.parse(decodeURIComponent(value));
        if (parsed?.access_token) return parsed.access_token;
        // Some formats store as array [access_token, refresh_token]
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch {
        // Cookie value might be the raw token
        if (value.split(".").length === 3) return value;
      }
    }
  }

  return null;
}

/**
 * Authenticate an API request by verifying the Supabase JWT.
 * 
 * Resolves the user identity from the token, fetches their profile
 * including admin status, and returns a typed AuthenticatedUser.
 * 
 * @throws AuthError if authentication fails
 */
export async function authenticate(request: Request): Promise<AuthenticatedUser> {
  const supabaseAdmin = getAdminClient();
  const token = extractToken(request);

  if (!token) {
    throw new AuthError("Missing authentication token. Include a Bearer token or valid session cookie.");
  }

  // Verify the JWT with Supabase
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new AuthError(
      `Authentication failed: ${error?.message || "Invalid or expired token."}`
    );
  }

  // Fetch profile for role and admin status
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, is_super_admin, is_suspended")
    .eq("id", user.id)
    .maybeSingle();

  // Block suspended accounts at the API level
  if (profile?.is_suspended) {
    throw new AuthError("Account suspended. Contact support.", 403);
  }

  return {
    userId: user.id,
    email: user.email || "",
    role: profile?.role || "owner",
    isSuperAdmin: profile?.is_super_admin || false,
    supabaseAdmin,
  };
}

/**
 * Authenticate an API request with fallback for development mode.
 * 
 * In production (real Supabase keys), this behaves identically to authenticate().
 * In development (placeholder keys), it falls back to extracting userId from 
 * the request body, maintaining local development ergonomics without 
 * compromising production security.
 * 
 * @throws AuthError if authentication fails in production mode
 */
export async function authenticateWithDevFallback(
  request: Request,
  bodyUserId?: string
): Promise<AuthenticatedUser> {
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";

  // Production: strict JWT verification
  if (!isPlaceholder) {
    return authenticate(request);
  }

  // Development fallback: trust request body userId, or fallback to first user in profiles
  let userId = bodyUserId;
  if (!userId) {
    try {
      const adminClient = getAdminClient();
      const { data: firstProfile } = await adminClient
        .from("profiles")
        .select("id")
        .limit(1)
        .maybeSingle();
      
      userId = firstProfile?.id || "00000000-0000-0000-0000-000000000000";
    } catch {
      userId = "00000000-0000-0000-0000-000000000000";
    }
  }

  // Ensure userId is strictly a string (TS2322 fix)
  const resolvedUserId: string = userId || "00000000-0000-0000-0000-000000000000";

  return {
    userId: resolvedUserId,
    email: "dev@sellerplus.local",
    role: "owner",
    isSuperAdmin: false,
    supabaseAdmin: getAdminClient(),
  };
}

// ─── Cron Authentication ─────────────────────────────────────────────

/**
 * Authenticate a cron/worker request using a shared secret.
 * 
 * Validates the `secret` query parameter against CRON_SECRET env var.
 * If CRON_SECRET is not configured, the endpoint is open (development mode).
 * 
 * @throws AuthError if secret is invalid
 */
export function authenticateCron(request: Request): CronContext {
  const cronSecret = process.env.CRON_SECRET;
  
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";

  // Prevent failing open in production if the env secret is accidentally deleted
  if (!cronSecret && !isPlaceholder) {
    throw new AuthError("CRON_SECRET is not configured. Failing closed for security.", 500);
  }

  if (cronSecret) {
    const { searchParams } = new URL(request.url);
    const providedSecret = searchParams.get("secret");

    if (providedSecret !== cronSecret) {
      throw new AuthError("Invalid cron secret. Unauthorized worker execution.", 401);
    }
  } else if (!isPlaceholder) {
    throw new AuthError("Unauthorized worker execution.", 401);
  }

  return {
    supabaseAdmin: getAdminClient(),
  };
}

// ─── Role Guards ─────────────────────────────────────────────────────

/**
 * Verify the authenticated user has one of the required roles.
 * @throws AuthError if user role is insufficient
 */
export function requireRole(
  user: AuthenticatedUser,
  allowedRoles: string[]
): void {
  // Super admins bypass all role checks
  if (user.isSuperAdmin) return;

  if (!allowedRoles.includes(user.role)) {
    throw new AuthError(
      `Insufficient permissions. Required roles: ${allowedRoles.join(", ")}. Current role: ${user.role}.`,
      403
    );
  }
}

/**
 * Verify the authenticated user is a super admin.
 * @throws AuthError if user is not a super admin
 */
export function requireSuperAdmin(user: AuthenticatedUser): void {
  if (!user.isSuperAdmin) {
    throw new AuthError("This action requires super administrator privileges.", 403);
  }
}

// ─── Error Response Helper ───────────────────────────────────────────

/**
 * Converts an AuthError (or generic error) into a NextResponse-compatible object.
 * Use in catch blocks across all API routes.
 */
export function authErrorResponse(error: unknown): { body: { error: string }; status: number } {
  if (error instanceof AuthError) {
    return { body: { error: error.message }, status: error.statusCode };
  }
  console.error("[AuthMiddleware] Unexpected error:", error);
  return { body: { error: "Internal server error." }, status: 500 };
}
